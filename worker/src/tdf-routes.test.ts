// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { tdfSaveStagePrediction, tdfSaveGrandDepart, tdfLeaderboard, tdfStages } from "./tdf-routes";
import type { RequestContext } from "./http";
import type { Env, User } from "./types";
import initialMigration from "../../migrations/0001_initial.sql?raw";
import tdfMigration from "../../migrations/0012_tdf.sql?raw";
import routeMigration from "../../migrations/0013_tdf_route.sql?raw";
import colsMapMigration from "../../migrations/0014_tdf_cols_map.sql?raw";
import classificationsMigration from "../../migrations/0015_tdf_classifications.sql?raw";

// Intégration sur D1 réelle (Miniflare) : harness identique à stats-routes.test.ts.
// On applique 0001_initial.sql + 0012_tdf.sql, on seed via env.DB,
// et on appelle les handlers directement.

let mf: Miniflare;
let env: Env;

const user: User = {
  id: "u1",
  pseudo: "Bob",
  created_at: "2026-06-01T00:00:00Z",
  is_admin: 0
};

async function applyMigrations(): Promise<void> {
  for (const migration of [
    initialMigration,
    tdfMigration,
    routeMigration,
    colsMapMigration,
    classificationsMigration
  ]) {
    for (const statement of migration.split(";")) {
      const sql = statement.trim();
      if (sql) await env.DB.prepare(sql).run();
    }
  }
}

/** Étape 1 non verrouillée + 11 coureurs actifs a..j et x. */
async function seedActiveStage(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status)
       VALUES (1, '2026-07-05', '2099-01-01T00:00:00Z', 'flat', 'Étape 1', 'upcoming')`
    )
    .run();
  for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "x"]) {
    await db
      .prepare(`INSERT INTO tdf_riders (id, name, status) VALUES (?, ?, 'active')`)
      .bind(id, `Rider ${id}`)
      .run();
  }
}

/** Même contenu mais lock_at dans le passé → étape verrouillée. */
async function seedLockedStage(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status)
       VALUES (1, '2026-07-05', '2020-01-01T00:00:00Z', 'flat', 'Étape 1', 'upcoming')`
    )
    .run();
  for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "x"]) {
    await db
      .prepare(`INSERT INTO tdf_riders (id, name, status) VALUES (?, ?, 'active')`)
      .bind(id, `Rider ${id}`)
      .run();
  }
}

function ctxFor(body: unknown): RequestContext {
  return {
    request: new Request("https://x/api/tdf/predictions/1", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
    env: env as unknown as Env,
    url: new URL("https://x/api/tdf/predictions/1"),
    user
  } as RequestContext;
}

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    compatibilityDate: "2024-11-01",
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"]
  });
  const db = await mf.getD1Database("DB");
  env = { DB: db } as unknown as Env;
  await applyMigrations();
  await env.DB.prepare(
    `INSERT INTO users (id, pseudo, pin_hash) VALUES ('u1', 'Bob', 'x')`
  ).run();
});

afterEach(async () => {
  await mf.dispose();
});

describe("tdfSaveStagePrediction validation", () => {
  it("refuse si moins de 10 coureurs", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxFor({ riderIds: ["a", "b"], combativeId: "a" });
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/10 coureurs/);
  });

  it("refuse les doublons", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxFor({
      riderIds: ["a", "a", "b", "c", "d", "e", "f", "g", "h", "i"],
      combativeId: "a"
    });
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/distinct/);
  });

  it("refuse un coureur inconnu", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxFor({
      riderIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "zzz"],
      combativeId: "a"
    });
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/inconnu|peloton/);
  });

  it("refuse après le verrou", async () => {
    await seedLockedStage(env.DB);
    const ctx = ctxFor({
      riderIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      combativeId: "a"
    });
    await expect(tdfSaveStagePrediction(ctx, 1)).rejects.toThrow(/verrou/i);
  });

  it("accepte un prono valide", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxFor({
      riderIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      combativeId: "a"
    });
    const res = await tdfSaveStagePrediction(ctx, 1);
    expect(res.status).toBe(200);
  });
});

function ctxForGrandDepart(body: unknown): RequestContext {
  return {
    request: new Request("https://x/api/tdf/grand-depart", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
    env: env as unknown as Env,
    url: new URL("https://x/api/tdf/grand-depart"),
    user
  } as RequestContext;
}

describe("tdfSaveGrandDepart validation", () => {
  it("accepte un grand départ valide et persiste la ligne", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxForGrandDepart({
      yellow: ["a", "b", "c"],
      white: ["d", "e", "f"],
      green: "g",
      polka: "h"
    });
    const res = await tdfSaveGrandDepart(ctx);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT * FROM tdf_grand_depart_predictions WHERE user_id = ?"
    )
      .bind(user.id)
      .first<Record<string, unknown>>();
    expect(row).not.toBeNull();
    expect(row!.yellow1).toBe("a");
    expect(row!.yellow2).toBe("b");
    expect(row!.yellow3).toBe("c");
    expect(row!.green).toBe("g");
    expect(row!.polka).toBe("h");
  });

  it("refuse un podium jaune non distinct", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxForGrandDepart({
      yellow: ["a", "a", "b"],
      white: ["d", "e", "f"],
      green: "g",
      polka: "h"
    });
    await expect(tdfSaveGrandDepart(ctx)).rejects.toThrow(/double|jaune/i);
  });

  it("refuse un coureur inconnu dans le podium jaune", async () => {
    await seedActiveStage(env.DB);
    const ctx = ctxForGrandDepart({
      yellow: ["a", "b", "zzz"],
      white: ["d", "e", "f"],
      green: "g",
      polka: "h"
    });
    await expect(tdfSaveGrandDepart(ctx)).rejects.toThrow(/inconnu/i);
  });

  it("refuse si le grand départ est verrouillé (étape 1 dans le passé)", async () => {
    await seedLockedStage(env.DB);
    const ctx = ctxForGrandDepart({
      yellow: ["a", "b", "c"],
      white: ["d", "e", "f"],
      green: "g",
      polka: "h"
    });
    await expect(tdfSaveGrandDepart(ctx)).rejects.toThrow(/verrou/i);
  });
});

describe("tdfStages", () => {
  it("renvoie chaque étape avec son profil et ses cols ordonnés", async () => {
    await env.DB.prepare(
      `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status, profile_image_url)
       VALUES (1, '2026-07-04', '2026-07-04T11:00:00Z', 'mountain', 'A → B', 'upcoming', 'https://img.aso.fr/x')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO tdf_stage_cols (stage_no, position, kind, name, category, km) VALUES
       (1, 1, 'col', 'Col deux', '2', 92.3),
       (1, 0, 'col', 'Col un', '1', 148.5)`
    ).run();

    const ctx = {
      request: new Request("https://x/api/tdf/stages"),
      env: env as unknown as Env,
      url: new URL("https://x/api/tdf/stages"),
      user
    } as RequestContext;
    const res = await tdfStages(ctx);
    const { stages } = (await res.json()) as {
      stages: { stage_no: number; profile_image_url: string; cols: { name: string; category: string }[] }[];
    };

    expect(stages[0].profile_image_url).toBe("https://img.aso.fr/x");
    // Ordre par position : Col un (0) avant Col deux (1).
    expect(stages[0].cols.map((c) => c.name)).toEqual(["Col un", "Col deux"]);
    expect(stages[0].cols.map((c) => c.category)).toEqual(["1", "2"]);
  });
});

describe("tdfLeaderboard", () => {
  function ctxGet(): RequestContext {
    return {
      request: new Request("https://x/api/tdf/leaderboard"),
      env: env as unknown as Env,
      url: new URL("https://x/api/tdf/leaderboard"),
      user
    } as RequestContext;
  }

  it("renvoie le détail des points et exclut les joueurs sans prono", async () => {
    // Bob (u1) a deux pronos d'étape (12 + 7 pts) + un grand départ (40 pts).
    await env.DB.prepare(
      `INSERT INTO users (id, pseudo, pin_hash) VALUES ('u2', 'Zoé', 'x')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, points, created_at, updated_at)
       VALUES ('u1', 1, '[]', 12, 't', 't'), ('u1', 2, '[]', 7, 't', 't')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO tdf_grand_depart_predictions (user_id, points, created_at, updated_at)
       VALUES ('u1', 40, 't', 't')`
    ).run();

    const res = await tdfLeaderboard(ctxGet());
    const { leaderboard } = (await res.json()) as {
      leaderboard: {
        user_id: string;
        points: number;
        stage_points: number;
        grand_depart_points: number;
        stages_played: number;
        best_stage: number;
      }[];
    };

    // u2 n'a aucun prono → exclu.
    expect(leaderboard).toHaveLength(1);
    const bob = leaderboard[0];
    expect(bob.user_id).toBe("u1");
    expect(bob.points).toBe(59);
    expect(bob.stage_points).toBe(19);
    expect(bob.grand_depart_points).toBe(40);
    expect(bob.stages_played).toBe(2);
    expect(bob.best_stage).toBe(12);
  });
});
