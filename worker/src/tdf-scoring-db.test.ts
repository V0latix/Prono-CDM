// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Env } from "./types";
import { recalculateTdfStagePoints, recalculateTdfGrandDepart } from "./tdf-scoring-db";

import initialMigration from "../../migrations/0001_initial.sql?raw";
import tdfMigration from "../../migrations/0012_tdf.sql?raw";

const migrations = [initialMigration, tdfMigration];

let mf: Miniflare;
let env: Env;

async function applyMigrations(): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.split(";")) {
      const sql = statement.trim();
      if (sql) await env.DB.prepare(sql).run();
    }
  }
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
});

afterEach(async () => {
  await mf.dispose();
});

describe("recalculateTdfStagePoints", () => {
  beforeEach(async () => {
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
    ).first<{ points: number }>();
    // "c" finit 3e -> 11-3 = 8 ; "a" finit 1er -> 11-1 = 10 ; combatif "a" juste -> +10
    expect(row?.points).toBe(28);
  });

  it("est idempotent (rejouer ne double pas)", async () => {
    await recalculateTdfStagePoints(env as any, 1);
    await recalculateTdfStagePoints(env as any, 1);
    const row = await env.DB.prepare(
      "SELECT points FROM tdf_stage_predictions WHERE user_id='u1' AND stage_no=1"
    ).first<{ points: number }>();
    expect(row?.points).toBe(28);
  });
});

describe("recalculateTdfGrandDepart", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash, is_admin) VALUES ('u1','Alice','x',0)"
    ).run();
    await env.DB.prepare(
      `INSERT INTO tdf_grand_depart_predictions
         (user_id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, points, created_at, updated_at)
       VALUES ('u1','a','b','c',NULL,NULL,NULL,NULL,NULL,0,'2026-07-01T00:00:00Z','2026-07-01T00:00:00Z')`
    ).run();
  });

  it("no-op : sans résultats ne change pas les points", async () => {
    await recalculateTdfGrandDepart(env as any);
    const row = await env.DB.prepare(
      "SELECT points FROM tdf_grand_depart_predictions WHERE user_id='u1'"
    ).first<{ points: number }>();
    expect(row?.points).toBe(0);
  });

  it("scoring : podium maillot jaune exact → 140 pts", async () => {
    await env.DB.prepare(
      `INSERT INTO tdf_grand_depart_results
         (id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, updated_at)
       VALUES (1,'a','b','c',NULL,NULL,NULL,NULL,NULL,'2026-07-27T18:00:00Z')`
    ).run();
    await recalculateTdfGrandDepart(env as any);
    const row = await env.DB.prepare(
      "SELECT points FROM tdf_grand_depart_predictions WHERE user_id='u1'"
    ).first<{ points: number }>();
    // yellow1 exact (1er) = 80, yellow2 exact (2e) = 40, yellow3 exact (3e) = 20 → 140
    expect(row?.points).toBe(140);
  });
});
