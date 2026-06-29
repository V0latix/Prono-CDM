// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { tdfSaveStagePrediction } from "./tdf-routes";
import type { RequestContext } from "./http";
import type { Env, User } from "./types";
import initialMigration from "../../migrations/0001_initial.sql?raw";
import tdfMigration from "../../migrations/0012_tdf.sql?raw";

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
  for (const migration of [initialMigration, tdfMigration]) {
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
