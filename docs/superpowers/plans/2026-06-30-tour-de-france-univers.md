# Univers Tour de France — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un second univers de pronostics « Tour de France » dans l'app Prono CDM (même repo, même app), séparé de la Coupe du monde par un sélecteur d'univers, réutilisant le socle existant (auth, profils, groupes).

**Architecture:** Univers = `cdm` (existant, inchangé) ou `tdf` (nouveau). Le frontend bascule via un sélecteur mémorisé en `localStorage` et monte un module `src/tdf/` quand l'univers actif est `tdf`. Le Worker expose un préfixe `/api/tdf/*` reflétant l'existant, plus des routes admin `/api/admin/tdf/*` protégées par un secret. Le Worker ne scrape jamais : une GitHub Action lance la lib Python `procyclingstats` et POST les résultats vers les routes admin. La saisie manuelle (écran admin visible du seul compte propriétaire) passe par les mêmes routes.

**Tech Stack:** React + Vite (front), Cloudflare Worker + D1 (API), Vitest (tests), GitHub Actions + Python `procyclingstats` (sync).

## Global Constraints

- Migrations : ne jamais modifier une migration appliquée, toujours ajouter une migration numérotée. Prochaine = `0012_tdf.sql`.
- Toute écriture en masse côté Worker passe par `runD1Batch` (`worker/src/d1-batch.ts`), jamais d'`await` par ligne en boucle.
- Validation serveur obligatoire (jamais que côté UI) : prono refusé après `lock_at`, coureurs distincts et connus.
- Anti-effacement : un résultat réel ne doit jamais être écrasé par du vide (`COALESCE` à l'upsert).
- Calcul des points = module pur partagé front/Worker (`src/shared/`), comme `src/shared/scoring.ts`.
- Pas de texte technique (Worker, API, migration) visible pour l'utilisateur.
- Tests + build verts avant chaque commit : `npm test` et `npm run build`.
- Routes Worker dispatchées dans `route()` à `worker/src/routes.ts:1663`.
- Barème figé (voir spec `docs/superpowers/specs/2026-06-30-tour-de-france-univers-design.md`).

---

### Task 1: Migration D1 `0012_tdf.sql`

**Files:**
- Create: `migrations/0012_tdf.sql`

**Interfaces:**
- Produces: tables `tdf_riders`, `tdf_stages`, `tdf_stage_results`, `tdf_stage_predictions`, `tdf_grand_depart_predictions`, `tdf_grand_depart_results` ; colonne `users.is_admin`.

- [ ] **Step 1: Écrire la migration**

```sql
-- Univers Tour de France : peloton, étapes, résultats, pronos, grand départ.
-- Tables préfixées tdf_. Socle (users/sessions/groupes/profils) réutilisé tel quel.

-- Le peloton : liste où le joueur pioche ses 10 coureurs et son combatif.
CREATE TABLE tdf_riders (
  id TEXT PRIMARY KEY,            -- slug PCS stable (ex: "tadej-pogacar")
  name TEXT NOT NULL,
  team TEXT,
  nationality TEXT,
  is_young INTEGER NOT NULL DEFAULT 0,  -- éligible maillot blanc
  status TEXT NOT NULL DEFAULT 'active' -- 'active' | 'abandoned'
);

-- Les étapes : verrou par défaut à 13h00 (éditable), combatif porté ici.
CREATE TABLE tdf_stages (
  stage_no INTEGER PRIMARY KEY,
  date TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  lock_at TEXT NOT NULL,              -- ISO UTC, défaut date + 13:00 Europe/Paris
  type TEXT NOT NULL DEFAULT 'flat',  -- 'flat' | 'mountain' | 'itt' | 'ttt'
  label TEXT NOT NULL DEFAULT '',     -- "Ville → Ville"
  status TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'finished'
  combative_rider_id TEXT,            -- résultat combatif (NULL tant qu'inconnu)
  last_synced_at TEXT
);

-- Top 10 réel d'une étape (rank 1..10 suffit pour le scoring).
CREATE TABLE tdf_stage_results (
  stage_no INTEGER NOT NULL,
  rider_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (stage_no, rank)
);

-- Prono d'étape : 10 coureurs en JSON texte + combatif. points = calculé.
CREATE TABLE tdf_stage_predictions (
  user_id TEXT NOT NULL,
  stage_no INTEGER NOT NULL,
  rider_ids TEXT NOT NULL,            -- JSON: ["slug1", ..., "slug10"]
  combative_rider_id TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, stage_no)
);

-- Prono grand départ : une ligne par joueur, figé au départ étape 1.
CREATE TABLE tdf_grand_depart_predictions (
  user_id TEXT PRIMARY KEY,
  yellow1 TEXT, yellow2 TEXT, yellow3 TEXT,
  white1 TEXT, white2 TEXT, white3 TEXT,
  green TEXT,
  polka TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Résultats finaux grand départ : ligne unique (id = 1).
CREATE TABLE tdf_grand_depart_results (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  yellow1 TEXT, yellow2 TEXT, yellow3 TEXT,
  white1 TEXT, white2 TEXT, white3 TEXT,
  green TEXT,
  polka TEXT,
  updated_at TEXT
);

-- Écran admin visible uniquement depuis le compte propriétaire.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Appliquer en local et vérifier**

Run: `npm run d1:migrate:local`
Expected: migration `0012_tdf.sql` appliquée sans erreur.

- [ ] **Step 3: Vérifier les tables**

Run: `npx wrangler d1 execute prono-cdm --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tdf_%';"`
Expected: les 6 tables `tdf_*` listées.

- [ ] **Step 4: Commit**

```bash
git add migrations/0012_tdf.sql
git commit -m "TDF: migration schema (peloton, etapes, pronos, grand depart, is_admin)"
```

---

### Task 2: Module de scoring pur `tdf-scoring.ts`

**Files:**
- Create: `src/shared/tdf-scoring.ts`
- Test: `src/shared/tdf-scoring.test.ts`

**Interfaces:**
- Produces:
  - `type StageResult = { rank: number; riderId: string }[]`
  - `scoreStage(riderIds: string[], combativePick: string | null, result: StageResult, combativeRiderId: string | null): number`
  - `type Podium = [string | null, string | null, string | null]`
  - `type GrandDepartPrediction = { yellow: Podium; white: Podium; green: string | null; polka: string | null }`
  - `type GrandDepartResults = { yellow: Podium; white: Podium; green: string | null; polka: string | null }`
  - `scoreGrandDepart(prediction: GrandDepartPrediction, results: GrandDepartResults): number`

- [ ] **Step 1: Écrire les tests d'étape**

```typescript
import { describe, expect, it } from "vitest";
import { scoreStage, scoreGrandDepart } from "./tdf-scoring";

const result = [
  { rank: 1, riderId: "a" },
  { rank: 2, riderId: "b" },
  { rank: 3, riderId: "c" },
  { rank: 4, riderId: "d" },
  { rank: 5, riderId: "e" },
  { rank: 6, riderId: "f" },
  { rank: 7, riderId: "g" },
  { rank: 8, riderId: "h" },
  { rank: 9, riderId: "i" },
  { rank: 10, riderId: "j" }
];

describe("scoreStage", () => {
  it("rapporte l'inverse de la place réelle (10e = 10 pts, 1er = 1 pt)", () => {
    // pick "j" (10e -> 10) et "a" (1er -> 1) = 11
    expect(scoreStage(["j", "a"], null, result, null)).toBe(11);
  });

  it("ignore les coureurs hors top 10", () => {
    expect(scoreStage(["zzz"], null, result, null)).toBe(0);
  });

  it("ajoute +10 si le combatif est juste", () => {
    expect(scoreStage([], "x", result, "x")).toBe(10);
  });

  it("ne donne pas le bonus combatif si faux", () => {
    expect(scoreStage([], "x", result, "y")).toBe(0);
  });

  it("max théorique = 65 (les 10 + combatif)", () => {
    expect(
      scoreStage(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], "k", result, "k")
    ).toBe(55 + 10);
  });
});
```

- [ ] **Step 2: Écrire les tests grand départ**

```typescript
const results = {
  yellow: ["a", "b", "c"] as [string, string, string],
  white: ["w1", "w2", "w3"] as [string, string, string],
  green: "g",
  polka: "p"
};

describe("scoreGrandDepart", () => {
  it("podium jaune place exacte = 80/40/20", () => {
    const pred = { yellow: ["a", "b", "c"], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(140);
  });

  it("Pogacar pronostiqué 1er finit 2e = moitié de la 2e place = 20", () => {
    // "b" finit 2e ; pronostiqué en 1re position -> mauvaise place -> moitié(2e)=20
    const pred = { yellow: ["b", null, null], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(20);
  });

  it("Seixas pronostiqué 3e finit 1er = moitié de la 1re place = 40", () => {
    // "a" finit 1er ; pronostiqué en 3e position -> mauvaise place -> moitié(1er)=40
    const pred = { yellow: [null, null, "a"], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(40);
  });

  it("podium blanc place exacte = 40/20/10", () => {
    const pred = { yellow: [null, null, null], white: ["w1", "w2", "w3"], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(70);
  });

  it("vert et pois justes = +40 chacun", () => {
    const pred = { yellow: [null, null, null], white: [null, null, null], green: "g", polka: "p" };
    expect(scoreGrandDepart(pred as any, results)).toBe(80);
  });

  it("vert faux = 0", () => {
    const pred = { yellow: [null, null, null], white: [null, null, null], green: "x", polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(0);
  });
});
```

- [ ] **Step 3: Lancer les tests (échec attendu)**

Run: `npx vitest run src/shared/tdf-scoring.test.ts`
Expected: FAIL ("scoreStage is not defined" / module introuvable).

- [ ] **Step 4: Implémenter le module**

```typescript
export type StageResult = { rank: number; riderId: string }[];
export type Podium = [string | null, string | null, string | null];
export type GrandDepartPrediction = {
  yellow: Podium;
  white: Podium;
  green: string | null;
  polka: string | null;
};
export type GrandDepartResults = GrandDepartPrediction;

// Prono d'étape : 10 coureurs non ordonnés. Chaque coureur présent dans le
// top 10 réel rapporte l'inverse de sa place réelle (10e -> 10 ... 1er -> 1).
// Combatif juste = +10. Coureurs en double comptés une seule fois.
export function scoreStage(
  riderIds: string[],
  combativePick: string | null,
  result: StageResult,
  combativeRiderId: string | null
): number {
  const rankByRider = new Map(result.map((r) => [r.riderId, r.rank]));
  let points = 0;
  for (const id of new Set(riderIds)) {
    const rank = rankByRider.get(id);
    if (rank !== undefined && rank >= 1 && rank <= 10) {
      points += 11 - rank;
    }
  }
  if (combativePick && combativeRiderId && combativePick === combativeRiderId) {
    points += 10;
  }
  return points;
}

// Barème par place RÉELLE du coureur. Plein tarif si place exacte (le coureur
// finit à la place où tu l'avais mis), moitié si bon coureur mais mauvaise place.
const YELLOW_FULL: Record<number, number> = { 1: 80, 2: 40, 3: 20 };
const WHITE_FULL: Record<number, number> = { 1: 40, 2: 20, 3: 10 };

function scorePodium(
  predicted: Podium,
  actual: Podium,
  full: Record<number, number>
): number {
  let points = 0;
  for (let predIndex = 0; predIndex < 3; predIndex += 1) {
    const rider = predicted[predIndex];
    if (!rider) continue;
    const actualIndex = actual.findIndex((r) => r === rider);
    if (actualIndex === -1) continue; // hors podium réel
    const actualPlace = actualIndex + 1;
    const base = full[actualPlace];
    points += predIndex === actualIndex ? base : base / 2;
  }
  return points;
}

export function scoreGrandDepart(
  prediction: GrandDepartPrediction,
  results: GrandDepartResults
): number {
  let points = 0;
  points += scorePodium(prediction.yellow, results.yellow, YELLOW_FULL);
  points += scorePodium(prediction.white, results.white, WHITE_FULL);
  if (prediction.green && prediction.green === results.green) points += 40;
  if (prediction.polka && prediction.polka === results.polka) points += 40;
  return points;
}
```

- [ ] **Step 5: Lancer les tests (succès attendu)**

Run: `npx vitest run src/shared/tdf-scoring.test.ts`
Expected: PASS (tous les cas, dont Pogačar=20 et Seixas=40).

- [ ] **Step 6: Commit**

```bash
git add src/shared/tdf-scoring.ts src/shared/tdf-scoring.test.ts
git commit -m "TDF: module de scoring pur (etape inverse + grand depart)"
```

---

### Task 3: Types Worker + recalcul des points TDF

**Files:**
- Modify: `worker/src/types.ts` (ajouter les types de lignes TDF + `is_admin` sur `User`)
- Create: `worker/src/tdf-scoring-db.ts`
- Test: `worker/src/tdf-scoring-db.test.ts`

**Interfaces:**
- Consumes: `scoreStage`, `scoreGrandDepart` (Task 2) ; `runD1Batch` (`worker/src/d1-batch.ts`) ; `Env` (`worker/src/types.ts`).
- Produces:
  - Types `TdfRiderRow`, `TdfStageRow`, `TdfStagePredictionRow`, `TdfGrandDepartPredictionRow`.
  - `recalculateTdfStagePoints(env: Env, stageNo: number): Promise<void>`
  - `recalculateTdfGrandDepart(env: Env): Promise<void>`

- [ ] **Step 1: Ajouter les types**

Dans `worker/src/types.ts`, ajouter `is_admin: number;` au type `User` et append :

```typescript
export type TdfRiderRow = {
  id: string;
  name: string;
  team: string | null;
  nationality: string | null;
  is_young: number;
  status: string;
};

export type TdfStageRow = {
  stage_no: number;
  date: string;
  lock_at: string;
  type: string;
  label: string;
  status: string;
  combative_rider_id: string | null;
  last_synced_at: string | null;
};

export type TdfStagePredictionRow = {
  user_id: string;
  stage_no: number;
  rider_ids: string;
  combative_rider_id: string | null;
  points: number;
  created_at: string;
  updated_at: string;
};

export type TdfGrandDepartPredictionRow = {
  user_id: string;
  yellow1: string | null; yellow2: string | null; yellow3: string | null;
  white1: string | null; white2: string | null; white3: string | null;
  green: string | null;
  polka: string | null;
  points: number;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Écrire le test de recalcul (avec faux D1 partagé existant)**

Réutiliser le faux D1 de `worker/src/test-db.ts` (même pattern que `flow.integration.test.ts`). Test :

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { recalculateTdfStagePoints } from "./tdf-scoring-db";

describe("recalculateTdfStagePoints", () => {
  let env: { DB: any };

  beforeEach(async () => {
    env = { DB: createTestDb() } as any;
    // seed minimal : 1 user, 1 étape, son résultat (top 3), 1 prono
    await env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash, is_admin) VALUES ('u1','Bob','x',0)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status) VALUES (1,'2026-07-04','2026-07-04T11:00:00Z','flat','A → B','finished')"
    ).run();
    for (const [rank, rider] of [[1, "a"], [2, "b"], [3, "c"]] as const) {
      await env.DB.prepare(
        "INSERT INTO tdf_stage_results (stage_no, rider_id, rank) VALUES (1, ?, ?)"
      ).bind(rider, rank).run();
    }
    await env.DB.prepare(
      "UPDATE tdf_stages SET combative_rider_id = 'a' WHERE stage_no = 1"
    ).run();
    await env.DB.prepare(
      `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, combative_rider_id, points, created_at, updated_at)
       VALUES ('u1', 1, '["c","a"]', 'a', 0, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`
    ).run();
  });

  it("écrit les points = inverse place + combatif", async () => {
    await recalculateTdfStagePoints(env as any, 1);
    const row = await env.DB.prepare(
      "SELECT points FROM tdf_stage_predictions WHERE user_id='u1' AND stage_no=1"
    ).first();
    // "c" finit 3e -> 11-3 = 8 ; "a" finit 1er -> 11-1 = 10 ; combatif "a" juste -> +10
    expect(row.points).toBe(28);
  });

  it("est idempotent (rejouer ne double pas)", async () => {
    await recalculateTdfStagePoints(env as any, 1);
    await recalculateTdfStagePoints(env as any, 1);
    const row = await env.DB.prepare(
      "SELECT points FROM tdf_stage_predictions WHERE user_id='u1' AND stage_no=1"
    ).first();
    expect(row.points).toBe(28);
  });
});
```

> Note : `worker/src/test-db.ts` doit connaître les tables `tdf_*`. Si le faux D1 valide le schéma, ajouter les `CREATE TABLE tdf_*` au seed du test-db (mêmes colonnes que la migration). Vérifier comment `flow.integration.test.ts` initialise les tables et suivre le même mécanisme.

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npx vitest run worker/src/tdf-scoring-db.test.ts`
Expected: FAIL (module `tdf-scoring-db` introuvable).

- [ ] **Step 4: Implémenter le recalcul**

```typescript
import {
  scoreStage,
  scoreGrandDepart,
  type StageResult
} from "../../src/shared/tdf-scoring";
import { runD1Batch } from "./d1-batch";
import type {
  Env,
  TdfStagePredictionRow,
  TdfGrandDepartPredictionRow
} from "./types";

// Recalcule et stocke les points de tous les pronos d'une étape, à partir
// du top 10 réel et du combatif. Batché via runD1Batch (budget cron).
export async function recalculateTdfStagePoints(
  env: Env,
  stageNo: number
): Promise<void> {
  const stage = await env.DB.prepare(
    "SELECT combative_rider_id FROM tdf_stages WHERE stage_no = ?"
  ).bind(stageNo).first<{ combative_rider_id: string | null }>();

  const resultRows = await env.DB.prepare(
    "SELECT rider_id, rank FROM tdf_stage_results WHERE stage_no = ? ORDER BY rank ASC"
  ).bind(stageNo).all<{ rider_id: string; rank: number }>();
  const result: StageResult = (resultRows.results ?? []).map((r) => ({
    rank: r.rank,
    riderId: r.rider_id
  }));

  const predictions = await env.DB.prepare(
    "SELECT * FROM tdf_stage_predictions WHERE stage_no = ?"
  ).bind(stageNo).all<TdfStagePredictionRow>();

  const updates: D1PreparedStatement[] = [];
  for (const pred of predictions.results ?? []) {
    let riderIds: string[] = [];
    try {
      riderIds = JSON.parse(pred.rider_ids) as string[];
    } catch {
      riderIds = [];
    }
    const points = scoreStage(
      riderIds,
      pred.combative_rider_id,
      result,
      stage?.combative_rider_id ?? null
    );
    updates.push(
      env.DB.prepare(
        "UPDATE tdf_stage_predictions SET points = ? WHERE user_id = ? AND stage_no = ?"
      ).bind(points, pred.user_id, pred.stage_no)
    );
  }
  await runD1Batch(env, updates);
}

// Recalcule les points grand départ de tous les joueurs à partir de la ligne
// unique de résultats finaux. No-op tant que les résultats ne sont pas posés.
export async function recalculateTdfGrandDepart(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    "SELECT * FROM tdf_grand_depart_results WHERE id = 1"
  ).first<TdfGrandDepartPredictionRow>();
  if (!res) return;

  const preds = await env.DB.prepare(
    "SELECT * FROM tdf_grand_depart_predictions"
  ).all<TdfGrandDepartPredictionRow>();

  const results = {
    yellow: [res.yellow1, res.yellow2, res.yellow3] as [string | null, string | null, string | null],
    white: [res.white1, res.white2, res.white3] as [string | null, string | null, string | null],
    green: res.green,
    polka: res.polka
  };

  const updates: D1PreparedStatement[] = [];
  for (const pred of preds.results ?? []) {
    const points = scoreGrandDepart(
      {
        yellow: [pred.yellow1, pred.yellow2, pred.yellow3],
        white: [pred.white1, pred.white2, pred.white3],
        green: pred.green,
        polka: pred.polka
      },
      results
    );
    updates.push(
      env.DB.prepare(
        "UPDATE tdf_grand_depart_predictions SET points = ? WHERE user_id = ?"
      ).bind(points, pred.user_id)
    );
  }
  await runD1Batch(env, updates);
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npx vitest run worker/src/tdf-scoring-db.test.ts`
Expected: PASS (28 pts, idempotent).

- [ ] **Step 6: Commit**

```bash
git add worker/src/types.ts worker/src/tdf-scoring-db.ts worker/src/tdf-scoring-db.test.ts worker/src/test-db.ts
git commit -m "TDF: types Worker + recalcul des points (etape + grand depart)"
```

---

### Task 4: Routes joueur `/api/tdf/*`

**Files:**
- Create: `worker/src/tdf-routes.ts`
- Modify: `worker/src/routes.ts` (brancher les routes TDF dans `route()` avant le `throw 404`)
- Test: `worker/src/tdf-routes.test.ts`

**Interfaces:**
- Consumes: `RequestContext`, `json`, `requireUser`, `HttpError`, `parseJson` (`worker/src/http.ts`) ; `recalculateTdfStagePoints` (Task 3).
- Produces (handlers exportés, branchés depuis `route()`):
  - `tdfRiders(ctx)` → `GET /api/tdf/riders`
  - `tdfStages(ctx)` → `GET /api/tdf/stages`
  - `tdfDashboard(ctx)` → `GET /api/tdf/dashboard`
  - `tdfSaveStagePrediction(ctx, stageNo)` → `PUT /api/tdf/predictions/:stageNo`
  - `tdfSaveGrandDepart(ctx)` → `PUT /api/tdf/grand-depart`
  - `tdfLeaderboard(ctx)` → `GET /api/tdf/leaderboard`
  - `tdfResults(ctx)` → `GET /api/tdf/results`

- [ ] **Step 1: Écrire les tests de validation**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "./test-db";
import { tdfSaveStagePrediction } from "./tdf-routes";

function ctxFor(body: unknown, user = { id: "u1", pseudo: "Bob", is_admin: 0 }) {
  return {
    request: new Request("https://x/api/tdf/predictions/1", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
    env: { DB: createTestDb() } as any,
    url: new URL("https://x/api/tdf/predictions/1"),
    user
  } as any;
}

describe("tdfSaveStagePrediction validation", () => {
  it("refuse si moins de 10 coureurs", async () => {
    const ctx = ctxFor({ riderIds: ["a", "b"], combativeId: "a" });
    await seedActiveStage(ctx.env); // étape 1 non verrouillée + 10 coureurs actifs a..j + x
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/10 coureurs/);
  });

  it("refuse les doublons", async () => {
    const ctx = ctxFor({ riderIds: ["a","a","b","c","d","e","f","g","h","i"], combativeId: "a" });
    await seedActiveStage(ctx.env);
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/distinct/);
  });

  it("refuse un coureur inconnu", async () => {
    const ctx = ctxFor({ riderIds: ["a","b","c","d","e","f","g","h","i","zzz"], combativeId: "a" });
    await seedActiveStage(ctx.env);
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/inconnu|peloton/);
  });

  it("refuse après le verrou", async () => {
    const ctx = ctxFor({ riderIds: ["a","b","c","d","e","f","g","h","i","j"], combativeId: "a" });
    await seedLockedStage(ctx.env); // lock_at dans le passé
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/verrou/i);
  });

  it("accepte un prono valide", async () => {
    const ctx = ctxFor({ riderIds: ["a","b","c","d","e","f","g","h","i","j"], combativeId: "a" });
    await seedActiveStage(ctx.env);
    const res = await tdfSaveStagePrediction(ctx, 1);
    expect(res.status).toBe(200);
  });
});
```

> `seedActiveStage` / `seedLockedStage` : helpers locaux du test qui insèrent une étape (`lock_at` futur/passé) + 11 coureurs actifs (`a`..`j`, `x`) dans le faux D1. Écrire ces helpers en haut du fichier de test.

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npx vitest run worker/src/tdf-routes.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter les handlers**

```typescript
import { HttpError, json, parseJson, requireUser, type RequestContext } from "./http";
import { recalculateTdfStagePoints } from "./tdf-scoring-db";
import type { TdfRiderRow, TdfStageRow } from "./types";

type StagePredictionPayload = { riderIds?: string[]; combativeId?: string | null };

async function activeRiderIds(ctx: RequestContext): Promise<Set<string>> {
  const rows = await ctx.env.DB.prepare(
    "SELECT id FROM tdf_riders WHERE status = 'active'"
  ).all<{ id: string }>();
  return new Set((rows.results ?? []).map((r) => r.id));
}

export async function tdfRiders(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    "SELECT id, name, team, nationality, is_young, status FROM tdf_riders WHERE status='active' ORDER BY name ASC"
  ).all<TdfRiderRow>();
  return json(ctx.request, ctx.env, { riders: rows.results ?? [] });
}

export async function tdfStages(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages ORDER BY stage_no ASC"
  ).all<TdfStageRow>();
  return json(ctx.request, ctx.env, { stages: rows.results ?? [] });
}

export async function tdfSaveStagePrediction(
  ctx: RequestContext,
  stageNo: number
): Promise<Response> {
  const user = requireUser(ctx);
  const stage = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages WHERE stage_no = ?"
  ).bind(stageNo).first<TdfStageRow>();
  if (!stage) throw new HttpError(404, "Étape introuvable.");
  if (new Date(stage.lock_at).getTime() <= Date.now()) {
    throw new HttpError(409, "Cette étape est verrouillée depuis le départ.");
  }

  const body = await parseJson<StagePredictionPayload>(ctx.request);
  const riderIds = Array.isArray(body.riderIds) ? body.riderIds : [];
  if (riderIds.length !== 10) {
    throw new HttpError(400, "Choisis exactement 10 coureurs.");
  }
  if (new Set(riderIds).size !== 10) {
    throw new HttpError(400, "Les 10 coureurs doivent être distincts.");
  }
  const active = await activeRiderIds(ctx);
  for (const id of riderIds) {
    if (!active.has(id)) throw new HttpError(400, "Coureur inconnu dans le peloton.");
  }
  const combativeId = body.combativeId ?? null;
  if (combativeId && !active.has(combativeId)) {
    throw new HttpError(400, "Coureur combatif inconnu dans le peloton.");
  }

  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, combative_rider_id, points, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id, stage_no) DO UPDATE SET
       rider_ids = excluded.rider_ids,
       combative_rider_id = excluded.combative_rider_id,
       updated_at = excluded.updated_at`
  ).bind(user.id, stageNo, JSON.stringify(riderIds), combativeId, now, now).run();

  return json(ctx.request, ctx.env, { ok: true });
}

export async function tdfSaveGrandDepart(ctx: RequestContext): Promise<Response> {
  const user = requireUser(ctx);
  const firstStage = await ctx.env.DB.prepare(
    "SELECT lock_at FROM tdf_stages WHERE stage_no = 1"
  ).first<{ lock_at: string }>();
  if (firstStage && new Date(firstStage.lock_at).getTime() <= Date.now()) {
    throw new HttpError(409, "Le grand départ est verrouillé.");
  }

  type Payload = {
    yellow?: (string | null)[];
    white?: (string | null)[];
    green?: string | null;
    polka?: string | null;
  };
  const body = await parseJson<Payload>(ctx.request);
  const active = await activeRiderIds(ctx);

  const podium = (arr: (string | null)[] | undefined, label: string): (string | null)[] => {
    const p = (arr ?? []).slice(0, 3);
    while (p.length < 3) p.push(null);
    const filled = p.filter(Boolean) as string[];
    if (new Set(filled).size !== filled.length) {
      throw new HttpError(400, `Coureurs en double dans le podium ${label}.`);
    }
    for (const id of filled) {
      if (!active.has(id)) throw new HttpError(400, `Coureur inconnu (podium ${label}).`);
    }
    return p;
  };

  const yellow = podium(body.yellow, "jaune");
  const white = podium(body.white, "blanc");
  const green = body.green ?? null;
  const polka = body.polka ?? null;
  for (const id of [green, polka].filter(Boolean) as string[]) {
    if (!active.has(id)) throw new HttpError(400, "Coureur inconnu (maillot).");
  }

  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_grand_depart_predictions
       (user_id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       yellow1 = excluded.yellow1, yellow2 = excluded.yellow2, yellow3 = excluded.yellow3,
       white1 = excluded.white1, white2 = excluded.white2, white3 = excluded.white3,
       green = excluded.green, polka = excluded.polka, updated_at = excluded.updated_at`
  ).bind(
    user.id, yellow[0], yellow[1], yellow[2], white[0], white[1], white[2], green, polka, now, now
  ).run();

  return json(ctx.request, ctx.env, { ok: true });
}

export async function tdfLeaderboard(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  // Total = points d'étape + points grand départ par joueur.
  const rows = await ctx.env.DB.prepare(
    `SELECT users.id AS user_id, users.pseudo,
            COALESCE(s.pts, 0) + COALESCE(gd.points, 0) AS points
     FROM users
     LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM tdf_stage_predictions GROUP BY user_id) s
       ON s.user_id = users.id
     LEFT JOIN tdf_grand_depart_predictions gd ON gd.user_id = users.id
     ORDER BY points DESC, users.pseudo ASC`
  ).all<{ user_id: string; pseudo: string; points: number }>();
  return json(ctx.request, ctx.env, { leaderboard: rows.results ?? [] });
}

export async function tdfDashboard(ctx: RequestContext): Promise<Response> {
  const user = requireUser(ctx);
  // Prochaine étape à pronostiquer = première étape non verrouillée.
  const next = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages WHERE lock_at > ? ORDER BY stage_no ASC LIMIT 1"
  ).bind(new Date().toISOString()).first<TdfStageRow>();
  const mine = next
    ? await ctx.env.DB.prepare(
        "SELECT rider_ids, combative_rider_id FROM tdf_stage_predictions WHERE user_id = ? AND stage_no = ?"
      ).bind(user.id, next.stage_no).first()
    : null;
  return json(ctx.request, ctx.env, { nextStage: next ?? null, myPrediction: mine ?? null });
}

export async function tdfResults(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const stages = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages WHERE status = 'finished' ORDER BY stage_no DESC"
  ).all<TdfStageRow>();
  const results = await ctx.env.DB.prepare(
    "SELECT stage_no, rider_id, rank FROM tdf_stage_results ORDER BY stage_no DESC, rank ASC"
  ).all<{ stage_no: number; rider_id: string; rank: number }>();
  return json(ctx.request, ctx.env, {
    stages: stages.results ?? [],
    results: results.results ?? []
  });
}
```

- [ ] **Step 4: Brancher dans `route()`**

Dans `worker/src/routes.ts`, importer les handlers et insérer juste avant `throw new HttpError(404, ...)` (ligne ~1708) :

```typescript
import {
  tdfRiders, tdfStages, tdfDashboard, tdfSaveStagePrediction,
  tdfSaveGrandDepart, tdfLeaderboard, tdfResults
} from "./tdf-routes";
// ... dans route(), avant le throw 404 :
if (pathname === "/api/tdf/riders") return tdfRiders(ctx);
if (pathname === "/api/tdf/stages") return tdfStages(ctx);
if (pathname === "/api/tdf/dashboard") return tdfDashboard(ctx);
if (pathname === "/api/tdf/leaderboard") return tdfLeaderboard(ctx);
if (pathname === "/api/tdf/results") return tdfResults(ctx);
if (pathname === "/api/tdf/grand-depart") return tdfSaveGrandDepart(ctx);
const tdfPredMatch = pathname.match(/^\/api\/tdf\/predictions\/(\d+)$/);
if (tdfPredMatch) return tdfSaveStagePrediction(ctx, Number(tdfPredMatch[1]));
```

- [ ] **Step 5: Lancer les tests (succès attendu)**

Run: `npx vitest run worker/src/tdf-routes.test.ts`
Expected: PASS (validations + accept).

- [ ] **Step 6: Build + commit**

Run: `npm run build`
Expected: pas d'erreur TS.

```bash
git add worker/src/tdf-routes.ts worker/src/tdf-routes.test.ts worker/src/routes.ts
git commit -m "TDF: routes joueur (pronos etape + grand depart, classement, resultats)"
```

---

### Task 5: Routes admin `/api/admin/tdf/*` + flag `is_admin` dans `/api/me`

**Files:**
- Modify: `worker/src/types.ts` (ajouter `TDF_SYNC_SECRET?: string` à `Env`)
- Create: `worker/src/tdf-admin-routes.ts`
- Modify: `worker/src/routes.ts` (brancher routes admin + exposer `is_admin` dans `me()`)
- Modify: `worker/src/auth.ts` (s'assurer que `getUserFromSession` SELECT `is_admin`)
- Test: `worker/src/tdf-admin-routes.test.ts`

**Interfaces:**
- Consumes: `recalculateTdfStagePoints`, `recalculateTdfGrandDepart` (Task 3).
- Produces:
  - `tdfAdminRoster(ctx)` → `POST /api/admin/tdf/roster`
  - `tdfAdminStageResult(ctx)` → `POST /api/admin/tdf/stage-result`
  - `tdfAdminFinal(ctx)` → `POST /api/admin/tdf/final`
  - Helper `assertTdfSyncSecret(ctx)` (header `x-tdf-sync-secret` OU user `is_admin`).

- [ ] **Step 1: Écrire les tests**

```typescript
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { tdfAdminStageResult } from "./tdf-admin-routes";

function adminCtx(body: unknown, secret = "s3cret") {
  return {
    request: new Request("https://x/api/admin/tdf/stage-result", {
      method: "POST",
      headers: { "x-tdf-sync-secret": secret },
      body: JSON.stringify(body)
    }),
    env: { DB: createTestDb(), TDF_SYNC_SECRET: "s3cret" } as any,
    url: new URL("https://x/api/admin/tdf/stage-result"),
    user: null
  } as any;
}

describe("tdfAdminStageResult", () => {
  it("refuse sans le bon secret et sans is_admin", async () => {
    const ctx = adminCtx({ stageNo: 1, top10: [], combativeId: null }, "wrong");
    await expect(tdfAdminStageResult(ctx)).rejects.toThrow(/403|interdit|autoris/i);
  });

  it("enregistre le top 10, le combatif et déclenche le recalcul", async () => {
    const ctx = adminCtx({
      stageNo: 1,
      top10: [{ rank: 1, riderId: "a" }, { rank: 2, riderId: "b" }],
      combativeId: "a"
    });
    await seedStageAndPrediction(ctx.env); // étape 1 + 1 prono ["a"] combatif "a"
    const res = await tdfAdminStageResult(ctx);
    expect(res.status).toBe(200);
    const stage = await ctx.env.DB.prepare(
      "SELECT status, combative_rider_id FROM tdf_stages WHERE stage_no=1"
    ).first();
    expect(stage.status).toBe("finished");
    expect(stage.combative_rider_id).toBe("a");
  });

  it("anti-effacement : un top10 vide n'écrase pas un résultat existant", async () => {
    const ctx = adminCtx({ stageNo: 1, top10: [], combativeId: null });
    await seedStageWithResult(ctx.env); // étape 1 a déjà un top 10
    await tdfAdminStageResult(ctx);
    const rows = await ctx.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_results WHERE stage_no=1"
    ).first();
    expect(rows.n).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npx vitest run worker/src/tdf-admin-routes.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter les routes admin**

```typescript
import { HttpError, json, parseJson, type RequestContext } from "./http";
import { runD1Batch } from "./d1-batch";
import {
  recalculateTdfStagePoints,
  recalculateTdfGrandDepart
} from "./tdf-scoring-db";

// Accès admin : soit le secret partagé (GitHub Action, pas de compte),
// soit un user connecté avec is_admin = 1 (écran manuel front).
export function assertTdfSyncSecret(ctx: RequestContext): void {
  const header = ctx.request.headers.get("x-tdf-sync-secret");
  const secretOk = Boolean(ctx.env.TDF_SYNC_SECRET) && header === ctx.env.TDF_SYNC_SECRET;
  const adminOk = Boolean(ctx.user?.is_admin);
  if (!secretOk && !adminOk) throw new HttpError(403, "Accès interdit.");
}

type RosterPayload = {
  riders?: { id: string; name: string; team?: string; nationality?: string; isYoung?: boolean }[];
  stages?: { stageNo: number; date: string; lockAt: string; type?: string; label?: string }[];
};

export async function tdfAdminRoster(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<RosterPayload>(ctx.request);
  const stmts: D1PreparedStatement[] = [];
  for (const r of body.riders ?? []) {
    stmts.push(
      ctx.env.DB.prepare(
        `INSERT INTO tdf_riders (id, name, team, nationality, is_young, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, team = excluded.team,
           nationality = excluded.nationality, is_young = excluded.is_young`
      ).bind(r.id, r.name, r.team ?? null, r.nationality ?? null, r.isYoung ? 1 : 0)
    );
  }
  for (const s of body.stages ?? []) {
    stmts.push(
      ctx.env.DB.prepare(
        `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status)
         VALUES (?, ?, ?, ?, ?, 'upcoming')
         ON CONFLICT(stage_no) DO UPDATE SET
           date = excluded.date, type = excluded.type, label = excluded.label`
      ).bind(s.stageNo, s.date, s.lockAt, s.type ?? "flat", s.label ?? "")
    );
  }
  await runD1Batch(ctx.env, stmts);
  return json(ctx.request, ctx.env, { ok: true });
}

type StageResultPayload = {
  stageNo?: number;
  top10?: { rank: number; riderId: string }[];
  combativeId?: string | null;
};

export async function tdfAdminStageResult(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<StageResultPayload>(ctx.request);
  const stageNo = body.stageNo;
  if (!stageNo) throw new HttpError(400, "Étape manquante.");
  const top10 = Array.isArray(body.top10) ? body.top10 : [];

  // Anti-effacement : on n'écrase JAMAIS un résultat réel par du vide.
  if (top10.length === 0) {
    const existing = await ctx.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_results WHERE stage_no = ?"
    ).bind(stageNo).first<{ n: number }>();
    if ((existing?.n ?? 0) > 0) {
      return json(ctx.request, ctx.env, { ok: true, skipped: "empty" });
    }
  }

  const stmts: D1PreparedStatement[] = [];
  if (top10.length > 0) {
    stmts.push(
      ctx.env.DB.prepare("DELETE FROM tdf_stage_results WHERE stage_no = ?").bind(stageNo)
    );
    for (const r of top10.slice(0, 10)) {
      stmts.push(
        ctx.env.DB.prepare(
          "INSERT INTO tdf_stage_results (stage_no, rider_id, rank) VALUES (?, ?, ?)"
        ).bind(stageNo, r.riderId, r.rank)
      );
    }
  }
  stmts.push(
    ctx.env.DB.prepare(
      `UPDATE tdf_stages SET status = 'finished',
         combative_rider_id = COALESCE(?, combative_rider_id),
         last_synced_at = ?
       WHERE stage_no = ?`
    ).bind(body.combativeId ?? null, new Date().toISOString(), stageNo)
  );
  await runD1Batch(ctx.env, stmts);

  await recalculateTdfStagePoints(ctx.env, stageNo);
  return json(ctx.request, ctx.env, { ok: true });
}

type FinalPayload = {
  yellow?: (string | null)[];
  white?: (string | null)[];
  green?: string | null;
  polka?: string | null;
};

export async function tdfAdminFinal(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<FinalPayload>(ctx.request);
  const y = (body.yellow ?? []).slice(0, 3);
  const w = (body.white ?? []).slice(0, 3);
  while (y.length < 3) y.push(null);
  while (w.length < 3) w.push(null);
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_grand_depart_results
       (id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       yellow1 = COALESCE(excluded.yellow1, yellow1),
       yellow2 = COALESCE(excluded.yellow2, yellow2),
       yellow3 = COALESCE(excluded.yellow3, yellow3),
       white1 = COALESCE(excluded.white1, white1),
       white2 = COALESCE(excluded.white2, white2),
       white3 = COALESCE(excluded.white3, white3),
       green = COALESCE(excluded.green, green),
       polka = COALESCE(excluded.polka, polka),
       updated_at = excluded.updated_at`
  ).bind(y[0], y[1], y[2], w[0], w[1], w[2], body.green ?? null, body.polka ?? null, new Date().toISOString()).run();

  await recalculateTdfGrandDepart(ctx.env);
  return json(ctx.request, ctx.env, { ok: true });
}
```

- [ ] **Step 4: Brancher dans `route()` + exposer `is_admin`**

Dans `worker/src/routes.ts`, importer les 3 handlers et ajouter avant le `throw 404` :

```typescript
import { tdfAdminRoster, tdfAdminStageResult, tdfAdminFinal } from "./tdf-admin-routes";
// ...
if (pathname === "/api/admin/tdf/roster") return tdfAdminRoster(ctx);
if (pathname === "/api/admin/tdf/stage-result") return tdfAdminStageResult(ctx);
if (pathname === "/api/admin/tdf/final") return tdfAdminFinal(ctx);
```

Modifier `me()` pour renvoyer le flag (le front en a besoin pour afficher l'écran admin) :

```typescript
async function me(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = ctx.user
    ? { id: ctx.user.id, pseudo: ctx.user.pseudo, isAdmin: Boolean(ctx.user.is_admin) }
    : null;
  return json(ctx.request, ctx.env, { user });
}
```

Vérifier dans `worker/src/auth.ts` que la requête `getUserFromSession` fait `SELECT ... is_admin` sur `users` (ajouter la colonne au SELECT si absente). Ajouter `TDF_SYNC_SECRET?: string;` au type `Env` dans `worker/src/types.ts`.

- [ ] **Step 5: Lancer les tests + suite complète**

Run: `npx vitest run worker/src/tdf-admin-routes.test.ts && npm test`
Expected: PASS (admin + toute la suite verte, y compris `me`).

> Si un test existant (`auth.test.ts`, `routes.test.ts`) casse à cause du `SELECT is_admin`, ajuster le seed du faux user pour inclure `is_admin`.

- [ ] **Step 6: Build + commit**

```bash
npm run build
git add worker/src/tdf-admin-routes.ts worker/src/tdf-admin-routes.test.ts worker/src/routes.ts worker/src/auth.ts worker/src/types.ts
git commit -m "TDF: routes admin (roster, resultat etape, final) + is_admin dans /api/me"
```

---

### Task 6: Front — client API TDF + sélecteur d'univers

**Files:**
- Modify: `src/api.ts` (rien à changer en base URL ; ajouter des helpers TDF si le projet en utilise, sinon réutiliser `api()`)
- Create: `src/tdf/api.ts` (wrappers typés sur `api()` pour les endpoints `/api/tdf/*`)
- Modify: `src/App.tsx` (état `universe` + sélecteur + montage conditionnel du module TDF)
- Test: `src/tdf/api.test.ts`

**Interfaces:**
- Consumes: `api(path, init?)` de `src/api.ts`.
- Produces: dans `src/tdf/api.ts` :
  - `fetchTdfRiders()`, `fetchTdfStages()`, `fetchTdfDashboard()`, `fetchTdfLeaderboard()`, `fetchTdfResults()`
  - `saveTdfStagePrediction(stageNo, riderIds, combativeId)`, `saveTdfGrandDepart(prediction)`
  - Types `TdfRider`, `TdfStage`.
- `src/App.tsx` produit : état `universe: "cdm" | "tdf"` persistant en `localStorage`, et rend `<TdfApp />` quand `universe === "tdf"`.

- [ ] **Step 1: Écrire le test du client TDF**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as apiModule from "../api";
import { saveTdfStagePrediction, fetchTdfRiders } from "./api";

describe("tdf api client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("PUT le prono d'étape sur la bonne route", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ ok: true } as any);
    await saveTdfStagePrediction(3, ["a","b","c","d","e","f","g","h","i","j"], "a");
    expect(spy).toHaveBeenCalledWith("/api/tdf/predictions/3", expect.objectContaining({ method: "PUT" }));
  });

  it("GET le peloton", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ riders: [] } as any);
    await fetchTdfRiders();
    expect(spy).toHaveBeenCalledWith("/api/tdf/riders");
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/tdf/api.test.ts`
Expected: FAIL (module `./api` du dossier tdf introuvable).

- [ ] **Step 3: Implémenter `src/tdf/api.ts`**

```typescript
import { api } from "../api";

export type TdfRider = {
  id: string; name: string; team: string | null;
  nationality: string | null; is_young: number; status: string;
};
export type TdfStage = {
  stage_no: number; date: string; lock_at: string;
  type: string; label: string; status: string;
  combative_rider_id: string | null;
};

export const fetchTdfRiders = () =>
  api("/api/tdf/riders") as Promise<{ riders: TdfRider[] }>;
export const fetchTdfStages = () =>
  api("/api/tdf/stages") as Promise<{ stages: TdfStage[] }>;
export const fetchTdfDashboard = () =>
  api("/api/tdf/dashboard") as Promise<{ nextStage: TdfStage | null; myPrediction: unknown }>;
export const fetchTdfLeaderboard = () =>
  api("/api/tdf/leaderboard") as Promise<{ leaderboard: { user_id: string; pseudo: string; points: number }[] }>;
export const fetchTdfResults = () =>
  api("/api/tdf/results") as Promise<{ stages: TdfStage[]; results: { stage_no: number; rider_id: string; rank: number }[] }>;

export const saveTdfStagePrediction = (
  stageNo: number, riderIds: string[], combativeId: string | null
) =>
  api(`/api/tdf/predictions/${stageNo}`, {
    method: "PUT",
    body: JSON.stringify({ riderIds, combativeId })
  });

export type TdfGrandDepartPrediction = {
  yellow: (string | null)[]; white: (string | null)[];
  green: string | null; polka: string | null;
};
export const saveTdfGrandDepart = (prediction: TdfGrandDepartPrediction) =>
  api("/api/tdf/grand-depart", { method: "PUT", body: JSON.stringify(prediction) });
```

> Adapter la signature exacte de `api()` à l'existant (`src/api.ts`) : si `api()` parse déjà le JSON et accepte `(path, init)`, garder ce qui précède ; sinon aligner sur la convention du projet (vérifier comment `useResource` appelle `api`).

- [ ] **Step 4: Ajouter le sélecteur d'univers dans `src/App.tsx`**

Lire l'état initial depuis `localStorage` (`pcdm_universe`, défaut `"cdm"`), un toggle dans le header, et un montage conditionnel :

```tsx
const [universe, setUniverse] = useState<"cdm" | "tdf">(
  () => (localStorage.getItem("pcdm_universe") as "cdm" | "tdf") || "cdm"
);
useEffect(() => { localStorage.setItem("pcdm_universe", universe); }, [universe]);
// dans le header, après le bouton pseudo :
// <UniverseSwitcher value={universe} onChange={setUniverse} />
// dans le rendu du shell principal :
// {universe === "tdf" ? <TdfApp user={user} /> : <CdmShell ... existant ... />}
```

Le composant `UniverseSwitcher` est un simple toggle deux états (⚽ / 🚴). `TdfApp` est créé en Task 7. Tant que Task 7 n'existe pas, stub `TdfApp` = `() => null` pour que le build passe.

- [ ] **Step 5: Lancer le test (succès attendu) + build**

Run: `npx vitest run src/tdf/api.test.ts && npm run build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add src/tdf/api.ts src/tdf/api.test.ts src/App.tsx
git commit -m "TDF: client API front + selecteur d'univers (cdm/tdf)"
```

---

### Task 7: Front — module `src/tdf/` (vues joueur)

**Files:**
- Create: `src/tdf/TdfApp.tsx` (shell TDF : nav Dashboard / Mes pronos / Classement / Résultats / Règlement)
- Create: `src/tdf/StagePrediction.tsx` (sélection 10 coureurs + combatif)
- Create: `src/tdf/GrandDepart.tsx` (3 podiums + vert + pois)
- Create: `src/tdf/TdfLeaderboard.tsx`, `src/tdf/TdfResults.tsx`, `src/tdf/TdfRules.tsx`
- Modify: `src/App.tsx` (remplacer le stub `TdfApp` par l'import réel)
- Modify: `src/styles.css` (classes TDF si besoin, réutiliser le design system existant)
- Test: `src/tdf/StagePrediction.test.tsx`

**Interfaces:**
- Consumes: `src/tdf/api.ts` (Task 6) ; design system de `src/styles.css`.
- Produces: `TdfApp` (export default) monté par `src/App.tsx`.

- [ ] **Step 1: Écrire le test de la vue prono d'étape**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StagePrediction from "./StagePrediction";
import * as tdfApi from "./api";

const riders = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`, name: `Rider ${i}`, team: "T", nationality: "FR", is_young: 0, status: "active"
}));

describe("StagePrediction", () => {
  it("empêche de valider tant que 10 coureurs ne sont pas choisis", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders } as any);
    const stage = { stage_no: 1, date: "2026-07-04", lock_at: "2999-01-01T00:00:00Z", type: "flat", label: "A → B", status: "upcoming", combative_rider_id: null };
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Rider 0"));
    const submit = screen.getByRole("button", { name: /valider/i });
    expect(submit).toBeDisabled();
  });

  it("envoie le prono une fois 10 coureurs + combatif choisis", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders } as any);
    const save = vi.spyOn(tdfApi, "saveTdfStagePrediction").mockResolvedValue({ ok: true } as any);
    const stage = { stage_no: 1, date: "2026-07-04", lock_at: "2999-01-01T00:00:00Z", type: "flat", label: "A → B", status: "upcoming", combative_rider_id: null };
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Rider 0"));
    for (let i = 0; i < 10; i += 1) fireEvent.click(screen.getByText(`Rider ${i}`));
    fireEvent.click(screen.getByRole("button", { name: /combatif.*Rider 0|Rider 0.*combatif/i }) ?? screen.getByText("Rider 0"));
    fireEvent.click(screen.getByRole("button", { name: /valider/i }));
    await waitFor(() => expect(save).toHaveBeenCalled());
  });
});
```

> Le second test dépend du markup exact (boutons de sélection / case combatif). Ajuster les sélecteurs aux `aria-label` réels que tu poses dans le composant. Garder au minimum le premier test (bouton désactivé < 10 coureurs) qui est robuste.

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/tdf/StagePrediction.test.tsx`
Expected: FAIL (composant introuvable).

- [ ] **Step 3: Implémenter `StagePrediction.tsx`**

Composant : charge `fetchTdfRiders()`, liste les coureurs cliquables, garde un `Set` de 10 max sélectionnés, un choix `combativeId` (un coureur), bouton « Valider » désactivé tant que `selected.size !== 10`. À la validation appelle `saveTdfStagePrediction(stage.stage_no, [...selected], combativeId)`. Réutiliser les cartes/listes du design system (`src/styles.css`). Afficher l'échéance (verrou `lock_at`) en clair. Bloquer l'UI si `Date.now() >= lock_at` (mais la vraie garde reste serveur).

```tsx
import { useEffect, useMemo, useState } from "react";
import { fetchTdfRiders, saveTdfStagePrediction, type TdfRider, type TdfStage } from "./api";

export default function StagePrediction({ stage }: { stage: TdfStage }) {
  const [riders, setRiders] = useState<TdfRider[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [combativeId, setCombativeId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const locked = useMemo(() => new Date(stage.lock_at).getTime() <= Date.now(), [stage.lock_at]);

  useEffect(() => { fetchTdfRiders().then((r) => setRiders(r.riders)); }, []);

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 10 ? [...cur, id] : cur
    );

  const submit = async () => {
    setStatus("saving");
    try {
      await saveTdfStagePrediction(stage.stage_no, selected, combativeId);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section>
      <h2>Étape {stage.stage_no} — {stage.label}</h2>
      <p>Choisis 10 coureurs ({selected.length}/10) + 1 combatif. Verrou : {new Date(stage.lock_at).toLocaleString("fr-FR")}.</p>
      <ul>
        {riders.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              aria-pressed={selected.includes(r.id)}
              disabled={locked}
              onClick={() => toggle(r.id)}
            >
              {r.name}
            </button>
            <button
              type="button"
              aria-label={`combatif ${r.name}`}
              aria-pressed={combativeId === r.id}
              disabled={locked}
              onClick={() => setCombativeId(r.id)}
            >
              ⚔️
            </button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={selected.length !== 10 || locked || status === "saving"} onClick={submit}>
        Valider mon prono
      </button>
      {status === "saved" && <p>Prono enregistré.</p>}
      {status === "error" && <p>Erreur, réessaie.</p>}
    </section>
  );
}
```

- [ ] **Step 4: Implémenter les autres vues + shell**

`GrandDepart.tsx` (3 sélecteurs podium jaune, 3 podium blanc, 1 vert, 1 pois → `saveTdfGrandDepart`), `TdfLeaderboard.tsx` (`fetchTdfLeaderboard`, table pseudo/points, filtre par groupe réutilisant le composant de groupe existant si dispo), `TdfResults.tsx` (`fetchTdfResults`, top 10 par étape + combatif), `TdfRules.tsx` (barème en clair, sans jargon technique), `TdfApp.tsx` (nav locale entre ces vues + dashboard via `fetchTdfDashboard`). Réutiliser le design system, pas de hero marketing.

- [ ] **Step 5: Remplacer le stub dans `src/App.tsx`**

```tsx
import TdfApp from "./tdf/TdfApp";
// remplacer le stub () => null par l'import réel
```

- [ ] **Step 6: Lancer les tests + build**

Run: `npx vitest run src/tdf/ && npm run build`
Expected: PASS + build OK.

- [ ] **Step 7: Commit**

```bash
git add src/tdf/ src/App.tsx src/styles.css
git commit -m "TDF: vues joueur (pronos etape, grand depart, classement, resultats, reglement)"
```

---

### Task 8: Front — écran admin (saisie/correction résultat d'étape)

**Files:**
- Create: `src/tdf/TdfAdmin.tsx`
- Modify: `src/tdf/TdfApp.tsx` (afficher l'onglet admin seulement si `user.isAdmin`)
- Test: `src/tdf/TdfAdmin.test.tsx`

**Interfaces:**
- Consumes: `api()` pour POST `/api/admin/tdf/stage-result` (avec header `x-tdf-sync-secret` non requis côté front : la garde `is_admin` suffit, l'utilisateur est connecté).
- Produces: `TdfAdmin` monté uniquement si `isAdmin`.

- [ ] **Step 1: Écrire le test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TdfAdmin from "./TdfAdmin";
import * as apiModule from "../api";

describe("TdfAdmin", () => {
  it("POST le résultat d'étape (top 10 + combatif)", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ ok: true } as any);
    render(<TdfAdmin />);
    fireEvent.change(screen.getByLabelText(/étape/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/1er/i), { target: { value: "tadej-pogacar" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("/api/admin/tdf/stage-result", expect.objectContaining({ method: "POST" }))
    );
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run src/tdf/TdfAdmin.test.tsx`
Expected: FAIL (composant introuvable).

- [ ] **Step 3: Implémenter `TdfAdmin.tsx`**

Formulaire simple : numéro d'étape, 10 champs de saisie (rang → id coureur, avec autocomplete depuis `fetchTdfRiders`), 1 champ combatif, bouton « Enregistrer le résultat ». POST `/api/admin/tdf/stage-result` `{ stageNo, top10: [{rank, riderId}], combativeId }`. Le même écran permet la correction (re-soumission écrase). Afficher la confirmation serveur.

```tsx
import { useState } from "react";
import { api } from "../api";

export default function TdfAdmin() {
  const [stageNo, setStageNo] = useState("");
  const [top, setTop] = useState<string[]>(Array(10).fill(""));
  const [combative, setCombative] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    const top10 = top
      .map((riderId, i) => ({ rank: i + 1, riderId: riderId.trim() }))
      .filter((r) => r.riderId);
    await api("/api/admin/tdf/stage-result", {
      method: "POST",
      body: JSON.stringify({ stageNo: Number(stageNo), top10, combativeId: combative.trim() || null })
    });
    setMsg("Résultat enregistré.");
  };

  return (
    <section>
      <h2>Saisie résultat d'étape</h2>
      <label>Étape <input aria-label="étape" value={stageNo} onChange={(e) => setStageNo(e.target.value)} /></label>
      {top.map((v, i) => (
        <label key={i}>{i + 1}er <input aria-label={`${i + 1}er`} value={v}
          onChange={(e) => setTop((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} /></label>
      ))}
      <label>Combatif <input aria-label="combatif" value={combative} onChange={(e) => setCombative(e.target.value)} /></label>
      <button type="button" onClick={submit}>Enregistrer le résultat</button>
      {msg && <p>{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Conditionner l'affichage à `isAdmin`**

Dans `TdfApp.tsx`, l'onglet/ lien « Admin » et le rendu de `<TdfAdmin />` ne s'affichent que si `user.isAdmin` (valeur issue de `/api/me`).

- [ ] **Step 5: Lancer le test + build**

Run: `npx vitest run src/tdf/TdfAdmin.test.tsx && npm run build`
Expected: PASS + build OK.

- [ ] **Step 6: Commit**

```bash
git add src/tdf/TdfAdmin.tsx src/tdf/TdfApp.tsx src/tdf/TdfAdmin.test.tsx
git commit -m "TDF: ecran admin de saisie/correction resultat d'etape (visible si is_admin)"
```

---

### Task 9: GitHub Action de synchro (Python `procyclingstats`)

**Files:**
- Create: `tools/tdf_sync.py` (script de scraping + POST)
- Create: `.github/workflows/tdf-sync.yml` (cron)
- Create: `tools/requirements.txt` (`procyclingstats`, `requests`)
- Create/Modify: `README.md` (section « Synchro Tour de France » : secrets requis)

**Interfaces:**
- Consumes: routes admin Worker (`/api/admin/tdf/roster`, `/stage-result`, `/final`) avec header `x-tdf-sync-secret`.
- Secrets GitHub : `TDF_API_BASE` (URL Worker), `TDF_SYNC_SECRET`.

- [ ] **Step 1: Écrire `tools/requirements.txt`**

```
procyclingstats
requests
```

- [ ] **Step 2: Écrire `tools/tdf_sync.py`**

Script idempotent : récupère la dernière étape avec résultat sur PCS, construit `top10` + `combativeId` (slugs PCS), POST vers `/api/admin/tdf/stage-result`. Un mode `--roster` POST la startlist + le parcours. Conçu pour tourner plusieurs fois sans effet de bord (l'upsert serveur est idempotent).

```python
import os
import sys
import requests
from procyclingstats import Race, Stage, RaceStartlist

API_BASE = os.environ["TDF_API_BASE"].rstrip("/")
SECRET = os.environ["TDF_SYNC_SECRET"]
RACE = "race/tour-de-france/2026"
HEADERS = {"x-tdf-sync-secret": SECRET, "content-type": "application/json"}

def slug(url: str) -> str:
    # "rider/tadej-pogacar" -> "tadej-pogacar"
    return url.rstrip("/").split("/")[-1]

def post(path: str, payload: dict) -> None:
    res = requests.post(f"{API_BASE}{path}", json=payload, headers=HEADERS, timeout=30)
    res.raise_for_status()
    print(path, res.status_code, res.text[:200])

def sync_roster() -> None:
    start = RaceStartlist(f"{RACE}/startlist").parse()
    riders = [
        {"id": slug(r["rider_url"]), "name": r["rider_name"],
         "team": r.get("team_name"), "nationality": r.get("nationality")}
        for r in start["startlist"]
    ]
    race = Race(RACE).parse()
    stages = [
        {"stageNo": i + 1, "date": s["date"],
         "lockAt": f'{s["date"]}T11:00:00Z',  # 13h00 Europe/Paris
         "label": s.get("departure", "") + " → " + s.get("arrival", "")}
        for i, s in enumerate(race.get("stages", []))
    ]
    post("/api/admin/tdf/roster", {"riders": riders, "stages": stages})

def sync_stage(stage_no: int) -> None:
    stage = Stage(f"{RACE}/stage-{stage_no}").parse()
    results = stage.get("results", [])[:10]
    top10 = [{"rank": int(r["rank"]), "riderId": slug(r["rider_url"])} for r in results if r.get("rank")]
    if not top10:
        print(f"étape {stage_no} : pas de résultat encore")
        return
    # combatif : RaceCombativeRiders ou champ dédié selon version de la lib
    combative_id = None
    post("/api/admin/tdf/stage-result", {"stageNo": stage_no, "top10": top10, "combativeId": combative_id})

if __name__ == "__main__":
    if "--roster" in sys.argv:
        sync_roster()
    else:
        # synchronise toutes les étapes 1..21 ; le serveur ignore les vides
        for n in range(1, 22):
            try:
                sync_stage(n)
            except Exception as exc:  # noqa: BLE001
                print(f"étape {n} échec: {exc}")
```

> Les clés exactes renvoyées par `procyclingstats` (`rank`, `rider_url`, `departure`...) dépendent de la version de la lib : vérifier avec `python -c "from procyclingstats import Stage; print(Stage('race/tour-de-france/2025/stage-13').parse().keys())"` au moment de l'implémentation et ajuster le mapping. Le combatif peut nécessiter `RaceCombativeRiders`. La saisie manuelle (Task 8) reste le secours si une clé manque.

- [ ] **Step 3: Écrire `.github/workflows/tdf-sync.yml`**

```yaml
name: TDF sync
on:
  schedule:
    - cron: "*/30 * * * *"   # toutes les 30 min (UTC)
  workflow_dispatch:
    inputs:
      roster:
        description: "Resynchroniser le peloton + le parcours"
        type: boolean
        default: false
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r tools/requirements.txt
      - name: Sync
        env:
          TDF_API_BASE: ${{ secrets.TDF_API_BASE }}
          TDF_SYNC_SECRET: ${{ secrets.TDF_SYNC_SECRET }}
        run: |
          if [ "${{ inputs.roster }}" = "true" ]; then
            python tools/tdf_sync.py --roster
          else
            python tools/tdf_sync.py
          fi
```

> Le cron toutes les 30 min ne tourne que pendant le Tour : désactiver le workflow hors juillet (toggle dans l'onglet Actions) ou garder, les POST vides sont sans effet (anti-effacement serveur).

- [ ] **Step 4: Tester le script manuellement (hors CI)**

Run (en local, contre le Worker de dev) :
```bash
TDF_API_BASE=http://127.0.0.1:8787 TDF_SYNC_SECRET=dev pip install -r tools/requirements.txt && \
TDF_API_BASE=http://127.0.0.1:8787 TDF_SYNC_SECRET=dev python tools/tdf_sync.py --roster
```
Expected : POST roster 200, étapes + coureurs visibles via `GET /api/tdf/stages` et `/api/tdf/riders`. Ajuster le mapping de clés si erreur de parsing.

- [ ] **Step 5: Documenter + commit**

Ajouter au `README.md` une courte section « Synchro Tour de France » : secrets `TDF_API_BASE`, `TDF_SYNC_SECRET` à poser dans GitHub et `TDF_SYNC_SECRET` côté Worker (`npx wrangler secret put TDF_SYNC_SECRET`), et passer son compte en `is_admin` (`UPDATE users SET is_admin=1 WHERE pseudo='...'`).

```bash
git add tools/tdf_sync.py tools/requirements.txt .github/workflows/tdf-sync.yml README.md
git commit -m "TDF: GitHub Action de synchro PCS (procyclingstats) vers routes admin"
```

---

### Task 10: Déploiement & vérification

**Files:** aucun fichier de code ; étapes d'exploitation.

- [ ] **Step 1: Suite complète + build**

Run: `npm test && npm run build && git diff --check`
Expected: tout vert.

- [ ] **Step 2: Poser le secret Worker + migration distante**

```bash
npx wrangler secret put TDF_SYNC_SECRET
npm run d1:migrate:remote
```

- [ ] **Step 3: Déployer l'API**

Run: `npm run deploy:api`
Expected: déploiement Worker OK.

- [ ] **Step 4: Passer ton compte en admin (base distante)**

Run: `npx wrangler d1 execute prono-cdm --remote --command "UPDATE users SET is_admin=1 WHERE pseudo='TON_PSEUDO';"`

- [ ] **Step 5: Seed peloton + parcours**

Déclencher le workflow `TDF sync` en mode `roster` (workflow_dispatch, `roster=true`), ou lancer `tools/tdf_sync.py --roster` contre l'API de prod. Vérifier `GET /api/tdf/stages` et `/api/tdf/riders`.

- [ ] **Step 6: Preview front + test connecté**

Run: `npm run deploy:web:preview`
Expected : se connecter sur le preview, basculer en univers TDF, voir le peloton, poser un prono d'étape, vérifier l'écran admin visible uniquement depuis ton compte. Ne donner le lien preview que si auth + dashboard TDF fonctionnent.

- [ ] **Step 7: Mise à jour CLAUDE.md**

Ajouter à `CLAUDE.md` : l'univers TDF, le module `src/tdf/`, les routes `/api/tdf/*` et `/api/admin/tdf/*`, la migration `0012`, le scoring `src/shared/tdf-scoring.ts`, la GitHub Action de synchro, et le flag `is_admin`. Commit.

```bash
git add CLAUDE.md
git commit -m "Docs: CLAUDE.md a jour (univers Tour de France)"
```

---

## Notes de revue (self-review)

- **Couverture spec** : section 1 (architecture/switch) → Task 6 ; section 2 (modèle) → Task 1 ; section 3 (pipeline auto + admin + manuel) → Tasks 5, 8, 9 ; section 4 (scoring) → Tasks 2, 3 ; section 5 (tests/ordre) → réparti, déploiement → Task 10. `is_admin` → Tasks 1, 5, 8.
- **Production avant prod** : Task 10 suit la règle projet (tests/build → migration distante → deploy API → preview), prod uniquement sur validation explicite du propriétaire.
- **Points à confirmer à l'implémentation** (signalés inline) : signature exacte de `api()` dans `src/api.ts` ; init des tables dans `worker/src/test-db.ts` ; clés réelles renvoyées par `procyclingstats` ; `getUserFromSession` doit sélectionner `is_admin`.
