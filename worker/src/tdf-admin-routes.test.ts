// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { tdfAdminStageResult, tdfAdminRefreshRoster } from "./tdf-admin-routes";
import type { RequestContext } from "./http";
import type { Env, User } from "./types";

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

async function seedStageAndPrediction(db: D1Database): Promise<void> {
  await db
    .prepare("INSERT INTO tdf_riders (id, name) VALUES ('a','Rider A'), ('b','Rider B')")
    .run();
  await db
    .prepare(
      "INSERT INTO tdf_stages (stage_no, date, lock_at) VALUES (1, '2026-07-05', '2026-07-05T11:00:00Z')"
    )
    .run();
  await db
    .prepare("INSERT INTO users (id, pseudo, pin_hash) VALUES ('u1','Alice','x')")
    .run();
  await db
    .prepare(
      `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, combative_rider_id, created_at, updated_at)
       VALUES ('u1', 1, '["a"]', 'a', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`
    )
    .run();
}

async function seedStageWithResult(db: D1Database): Promise<void> {
  await db.prepare("INSERT INTO tdf_riders (id, name) VALUES ('a','Rider A')").run();
  await db
    .prepare(
      "INSERT INTO tdf_stages (stage_no, date, lock_at) VALUES (1, '2026-07-05', '2026-07-05T11:00:00Z')"
    )
    .run();
  await db
    .prepare("INSERT INTO tdf_stage_results (stage_no, rider_id, rank) VALUES (1, 'a', 1)")
    .run();
}

function makeCtx(
  body: unknown,
  overrides: { secret?: string | null; user?: User | null } = {}
): RequestContext {
  const headers: Record<string, string> = { "content-type": "application/json" };
  // null = no header; undefined = use default "s3cret"
  const secret = overrides.secret === undefined ? "s3cret" : overrides.secret;
  if (secret !== null) headers["x-tdf-sync-secret"] = secret;

  const request = new Request("https://x/api/admin/tdf/stage-result", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return {
    request,
    env: { ...env, TDF_SYNC_SECRET: "s3cret" } as Env,
    url: new URL(request.url),
    user: overrides.user !== undefined ? overrides.user : null
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
});

afterEach(async () => {
  await mf.dispose();
});

describe("tdfAdminStageResult", () => {
  it("refuse sans le bon secret et sans is_admin", async () => {
    const ctx = makeCtx(
      { stageNo: 1, top10: [], combativeId: null },
      { secret: "wrong", user: null }
    );
    await expect(tdfAdminStageResult(ctx)).rejects.toThrow(/403|interdit|autoris/i);
  });

  it("enregistre le top 10, le combatif et déclenche le recalcul", async () => {
    await seedStageAndPrediction(env.DB);
    const ctx = makeCtx({
      stageNo: 1,
      top10: [
        { rank: 1, riderId: "a" },
        { rank: 2, riderId: "b" }
      ],
      combativeId: "a"
    });
    const res = await tdfAdminStageResult(ctx);
    expect(res.status).toBe(200);
    const stage = await env.DB.prepare(
      "SELECT status, combative_rider_id FROM tdf_stages WHERE stage_no=1"
    ).first<{ status: string; combative_rider_id: string }>();
    expect(stage?.status).toBe("finished");
    expect(stage?.combative_rider_id).toBe("a");
  });

  it("anti-effacement : un top10 vide n'écrase pas un résultat existant", async () => {
    await seedStageWithResult(env.DB);
    const ctx = makeCtx({ stageNo: 1, top10: [], combativeId: null });
    await tdfAdminStageResult(ctx);
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_results WHERE stage_no=1"
    ).first<{ n: number }>();
    expect(rows?.n).toBeGreaterThan(0);
  });

  it("is_admin path : un admin sans secret header est autorisé", async () => {
    await seedStageAndPrediction(env.DB);
    const adminUser: User = {
      id: "u1",
      pseudo: "Alice",
      created_at: "2026-06-01T00:00:00Z",
      is_admin: 1
    };
    const ctx = makeCtx(
      { stageNo: 1, top10: [{ rank: 1, riderId: "a" }], combativeId: null },
      { secret: null, user: adminUser }
    );
    const res = await tdfAdminStageResult(ctx);
    expect(res.status).toBe(200);
  });
});

describe("tdfAdminRefreshRoster", () => {
  it("refuse sans le bon secret et sans is_admin", async () => {
    const ctx = makeCtx({}, { secret: "wrong", user: null });
    await expect(tdfAdminRefreshRoster(ctx)).rejects.toThrow(/403|interdit|autoris/i);
  });
});
