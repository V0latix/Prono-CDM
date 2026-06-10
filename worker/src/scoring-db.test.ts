// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
// Migration réelle chargée en texte via Vite (`?raw`) : pas besoin de `node:fs`
// ni des types Node dans le tsconfig Worker.
import migration from "../../migrations/0001_initial.sql?raw";
import { recalculateAllPoints } from "./scoring-db";
import type { Env } from "./types";

// Test d'intégration : on rejoue le VRAI SQL de recalculateAllPoints sur une
// base D1 réelle (miniflare + SQLite), pour valider le câblage des colonnes
// (lecture des scores/stage/winner_code, écriture de points/exact/result/diff).
// Les règles de calcul pur sont couvertes par src/shared/scoring.test.ts ; ici
// on vérifie que la chaîne DB -> scorePrediction -> DB fonctionne de bout en bout.

let mf: Miniflare;
let env: Env;

type SeedMatch = {
  id: string;
  stage: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerCode: string | null;
};

type SeedPrediction = {
  id: string;
  matchId: string;
  home: number;
  away: number;
  winnerCode: string | null;
};

async function applyMigration(): Promise<void> {
  for (const statement of migration.split(";")) {
    const sql = statement.trim();
    if (sql) await env.DB.prepare(sql).run();
  }
}

async function seedMatch(match: SeedMatch): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO matches (id, external_id, home_team, away_team, kickoff_at, stage,
       status, home_score, away_score, winner_team, winner_code, last_synced_at)
     VALUES (?, ?, 'Home', 'Away', '2026-06-11T19:00:00Z', ?, ?, ?, ?, NULL, ?, '2026-06-11T22:00:00Z')`
  )
    .bind(
      match.id,
      match.id,
      match.stage,
      match.status,
      match.homeScore,
      match.awayScore,
      match.winnerCode
    )
    .run();
}

async function seedPrediction(userId: string, prediction: SeedPrediction): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO predictions (id, user_id, match_id, predicted_home_score,
       predicted_away_score, predicted_winner_code)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      prediction.id,
      userId,
      prediction.matchId,
      prediction.home,
      prediction.away,
      prediction.winnerCode
    )
    .run();
}

async function readPrediction(id: string) {
  return env.DB.prepare(
    "SELECT points, exact_score, correct_result, correct_goal_diff FROM predictions WHERE id = ?"
  )
    .bind(id)
    .first<{
      points: number;
      exact_score: number;
      correct_result: number;
      correct_goal_diff: number;
    }>();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    compatibilityDate: "2024-11-01",
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"]
  });
  const db = await mf.getD1Database("DB");
  env = { DB: db } as unknown as Env;
});

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  for (const table of [
    "predictions",
    "activity_feed",
    "settings",
    "matches",
    "users"
  ]) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  await applyMigration();
  await env.DB.prepare(
    "INSERT INTO users (id, pseudo, pin_hash) VALUES ('u1', 'Dede', 'x')"
  ).run();
});

describe("recalculateAllPoints (intégration D1 réelle)", () => {
  it("attribue les points d'une poule selon le score final", async () => {
    // Match de poule terminé 2-1 (victoire domicile, écart de 1).
    await seedMatch({
      id: "m1",
      stage: "GROUP_STAGE",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      winnerCode: "HOME_TEAM"
    });
    await seedPrediction("u1", { id: "p_exact", matchId: "m1", home: 2, away: 1, winnerCode: null });

    await env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash) VALUES ('u2','Bob','x'),('u3','Lea','x'),('u4','Max','x')"
    ).run();
    // Bon résultat + bon écart, score non exact (3-2 -> écart 1).
    await seedPrediction("u2", { id: "p_diff", matchId: "m1", home: 3, away: 2, winnerCode: null });
    // Bon résultat, mauvais écart (3-0 -> écart 3).
    await seedPrediction("u3", { id: "p_result", matchId: "m1", home: 3, away: 0, winnerCode: null });
    // Mauvais résultat (victoire extérieur pronostiquée).
    await seedPrediction("u4", { id: "p_miss", matchId: "m1", home: 0, away: 1, winnerCode: null });

    await recalculateAllPoints(env);

    expect(await readPrediction("p_exact")).toEqual({
      points: 5,
      exact_score: 1,
      correct_result: 1,
      correct_goal_diff: 1
    });
    expect(await readPrediction("p_diff")).toEqual({
      points: 4,
      exact_score: 0,
      correct_result: 1,
      correct_goal_diff: 1
    });
    expect(await readPrediction("p_result")).toEqual({
      points: 3,
      exact_score: 0,
      correct_result: 1,
      correct_goal_diff: 0
    });
    expect(await readPrediction("p_miss")).toEqual({
      points: 0,
      exact_score: 0,
      correct_result: 0,
      correct_goal_diff: 0
    });
  });

  it("utilise winner_code pour une phase finale finie aux tirs au but", async () => {
    // Finale 1-1, qualifié = équipe à domicile (tirs au but).
    await seedMatch({
      id: "k1",
      stage: "FINAL",
      status: "FINISHED",
      homeScore: 1,
      awayScore: 1,
      winnerCode: "HOME_TEAM"
    });
    // Score exact + bon qualifié -> 10.
    await seedPrediction("u1", { id: "k_exact", matchId: "k1", home: 1, away: 1, winnerCode: "HOME_TEAM" });

    await env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash) VALUES ('u2','Bob','x'),('u3','Lea','x')"
    ).run();
    // Bon qualifié, nul pronostiqué mais score différent (2-2) -> 8 (écart identique).
    await seedPrediction("u2", { id: "k_diff", matchId: "k1", home: 2, away: 2, winnerCode: "HOME_TEAM" });
    // Mauvais qualifié -> 0.
    await seedPrediction("u3", { id: "k_miss", matchId: "k1", home: 1, away: 1, winnerCode: "AWAY_TEAM" });

    await recalculateAllPoints(env);

    expect((await readPrediction("k_exact"))?.points).toBe(10);
    expect(await readPrediction("k_diff")).toEqual({
      points: 8,
      exact_score: 0,
      correct_result: 1,
      correct_goal_diff: 1
    });
    expect((await readPrediction("k_miss"))?.points).toBe(0);
  });

  it("laisse 0 point tant que le match n'a pas de score", async () => {
    await seedMatch({
      id: "m_pending",
      stage: "GROUP_STAGE",
      status: "TIMED",
      homeScore: null,
      awayScore: null,
      winnerCode: null
    });
    await seedPrediction("u1", { id: "p_pending", matchId: "m_pending", home: 2, away: 1, winnerCode: null });

    await recalculateAllPoints(env);

    expect(await readPrediction("p_pending")).toEqual({
      points: 0,
      exact_score: 0,
      correct_result: 0,
      correct_goal_diff: 0
    });
  });

  it("journalise un score exact dans le feed d'activité", async () => {
    await seedMatch({
      id: "m1",
      stage: "GROUP_STAGE",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      winnerCode: "HOME_TEAM"
    });
    await seedPrediction("u1", { id: "p_exact", matchId: "m1", home: 2, away: 1, winnerCode: null });

    await recalculateAllPoints(env);

    const activity = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activity_feed WHERE type = 'exact_score' AND user_id = 'u1'"
    ).first<{ n: number }>();
    expect(activity?.n).toBe(1);
  });
});
