// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import initialMigration from "../../migrations/0001_initial.sql?raw";
import tdfMigration from "../../migrations/0012_tdf.sql?raw";
import routeMigration from "../../migrations/0013_tdf_route.sql?raw";
import colsMapMigration from "../../migrations/0014_tdf_cols_map.sql?raw";
import classificationsMigration from "../../migrations/0015_tdf_classifications.sql?raw";
import iteHtml from "../../src/shared/__fixtures__/letour-ite.html?raw";
import iceHtml from "../../src/shared/__fixtures__/letour-ice.html?raw";
import pageHtml from "../../src/shared/__fixtures__/letour-stage-page.html?raw";
import stageDetailHtml from "../../src/shared/__fixtures__/letour-stage-detail.html?raw";
import { syncTourDeFrance, refreshTdfPeloton, refreshTdfRoute } from "./tour-de-france";
import type { Env } from "./types";

// Synchro reelle sur D1 (miniflare) avec un `fetch` injecte qui renvoie de vrais
// fragments letour.fr captures en fixtures. Verifie : peloton + top 10 + combatif
// + statut etape + recalcul des points.

const migrations = [
  initialMigration,
  tdfMigration,
  routeMigration,
  colsMapMigration,
  classificationsMigration
];
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

// Mappe l'URL letour vers la fixture correspondante.
function fakeFetch(url: string) {
  let body = "";
  if (url.includes("/en/rankings/stage-")) body = pageHtml;
  else if (url.includes("/ice/")) body = iceHtml;
  else body = iteHtml; // ite + itg/ipg/img/ijg : meme table pour le test
  return Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
}

beforeEach(async () => {
  mf = new Miniflare({
    modules: true,
    compatibilityDate: "2024-11-01",
    script: "export default { fetch() { return new Response('ok'); } };",
    d1Databases: ["DB"]
  });
  env = { DB: await mf.getD1Database("DB") } as unknown as Env;
  await applyMigrations();

  await env.DB.prepare(
    "INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status) VALUES (1,'2026-07-04','2026-07-04T11:00:00Z','flat','Barcelone','upcoming')"
  ).run();
  await env.DB.prepare(
    "INSERT INTO users (id, pseudo, pin_hash, is_admin) VALUES ('u1','Bob','x',0)"
  ).run();
  // Bob a pronostique le dossard 101 (Philipsen, 1er -> 11-1 = 10 pts).
  await env.DB.prepare(
    `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, combative_rider_id, points, created_at, updated_at)
     VALUES ('u1', 1, '["101"]', NULL, 0, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`
  ).run();
});

afterEach(async () => {
  await mf.dispose();
});

describe("syncTourDeFrance", () => {
  it("ingere top 10 + combatif, marque l'etape finie et recalcule les points", async () => {
    const res = await syncTourDeFrance(env, {
      fetch: fakeFetch,
      now: new Date("2026-07-04T18:00:00Z")
    });
    expect(res.error).toBeUndefined();

    const riders = await env.DB.prepare("SELECT COUNT(*) AS n FROM tdf_riders").first<{ n: number }>();
    expect(riders?.n).toBe(3);

    const results = await env.DB.prepare(
      "SELECT rider_id, rank FROM tdf_stage_results WHERE stage_no = 1 ORDER BY rank ASC"
    ).all<{ rider_id: string; rank: number }>();
    expect((results.results ?? []).map((r) => r.rider_id)).toEqual(["101", "41", "228"]);

    const stage = await env.DB.prepare(
      "SELECT status, combative_rider_id FROM tdf_stages WHERE stage_no = 1"
    ).first<{ status: string; combative_rider_id: string }>();
    expect(stage?.status).toBe("finished");
    expect(stage?.combative_rider_id).toBe("188");

    const pred = await env.DB.prepare(
      "SELECT points FROM tdf_stage_predictions WHERE user_id = 'u1'"
    ).first<{ points: number }>();
    expect(pred?.points).toBe(10);

    const nat = await env.DB.prepare(
      "SELECT nationality FROM tdf_riders WHERE id = '101'"
    ).first<{ nationality: string }>();
    expect(nat?.nationality).toBe("BEL");

    // Classements généraux par maillot : chaque maillot reçoit le top du général.
    const yellow = await env.DB.prepare(
      "SELECT rider_id FROM tdf_classifications WHERE jersey = 'yellow' ORDER BY rank ASC"
    ).all<{ rider_id: string }>();
    expect((yellow.results ?? [])[0]?.rider_id).toBe("101");
    const jerseys = await env.DB.prepare(
      "SELECT DISTINCT jersey FROM tdf_classifications ORDER BY jersey"
    ).all<{ jersey: string }>();
    expect((jerseys.results ?? []).map((j) => j.jersey)).toEqual([
      "green",
      "polka",
      "white",
      "yellow"
    ]);
  });

  it("refreshTdfPeloton charge le peloton et purge les coureurs d'exemple", async () => {
    // un coureur d'exemple a id non numerique (comme le seed de preview)
    await env.DB.prepare(
      "INSERT INTO tdf_riders (id, name, team, nationality, is_young, status) VALUES ('tadej-pogacar','Demo','Demo',NULL,0,'active')"
    ).run();

    const out = await refreshTdfPeloton(env, { fetch: fakeFetch });
    expect(out.loaded).toBe(3);

    const sample = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_riders WHERE id NOT GLOB '[0-9]*'"
    ).first<{ n: number }>();
    expect(sample?.n).toBe(0);

    const real = await env.DB.prepare(
      "SELECT name, nationality FROM tdf_riders WHERE id = '101'"
    ).first<{ name: string; nationality: string }>();
    expect(real?.nationality).toBe("BEL");
  });

  it("est idempotent et n'efface pas un resultat existant", async () => {
    await syncTourDeFrance(env, { fetch: fakeFetch, now: new Date("2026-07-04T18:00:00Z") });
    await syncTourDeFrance(env, { fetch: fakeFetch, now: new Date("2026-07-05T18:00:00Z") });
    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_results WHERE stage_no = 1"
    ).first<{ n: number }>();
    expect(n?.n).toBe(3);
  });

  it("expose le statut de synchro", async () => {
    await syncTourDeFrance(env, { fetch: fakeFetch, now: new Date("2026-07-04T18:00:00Z") });
    const st = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'tdf_sync_status'"
    ).first<{ value: string }>();
    expect(st?.value).toBe("ok");
  });
});

describe("refreshTdfRoute", () => {
  // fetch local : toute page d'étape /en/stage-N renvoie le profil capturé.
  const routeFetch = (url: string) =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(/\/en\/stage-\d+/.test(url) ? stageDetailHtml : "")
    });

  it("scrape profil + cols et crée le calendrier manquant", async () => {
    const out = await refreshTdfRoute(env, { fetch: routeFetch });
    expect(out.loaded).toBe(21);

    // L'étape 1 (existante) reçoit l'image de profil ASO + la carte des cols.
    const stage1 = await env.DB.prepare(
      "SELECT profile_image_url AS img, cols_map_url AS map FROM tdf_stages WHERE stage_no = 1"
    ).first<{ img: string; map: string }>();
    expect(stage1?.img).toContain("tdf26-profils");
    expect(stage1?.map).toContain("cartepot");

    // Les 20 autres étapes sont créées (date présente dans le profil).
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stages"
    ).first<{ n: number }>();
    expect(count?.n).toBe(21);

    // Les cols catégorisés (1/2/3) sont stockés, dans l'ordre.
    const cols = await env.DB.prepare(
      "SELECT category, name FROM tdf_stage_cols WHERE stage_no = 1 ORDER BY position ASC"
    ).all<{ category: string; name: string }>();
    expect((cols.results ?? []).map((c) => c.category)).toEqual(["1", "2", "3"]);
  });

  it("anti-effacement : un parsing vide n'efface pas les cols existants", async () => {
    await refreshTdfRoute(env, { fetch: routeFetch });
    // Un fetch qui ne renvoie aucun parcours ne doit pas vider les cols.
    const emptyFetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    await refreshTdfRoute(env, { fetch: emptyFetch });
    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_cols WHERE stage_no = 1"
    ).first<{ n: number }>();
    expect(n?.n).toBe(3);
  });
});
