// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import migration from "../../migrations/0001_initial.sql?raw";
import matchGroupMigration from "../../migrations/0010_match_group.sql?raw";
import { buildMatchUpsertSql } from "./football-data";
import type { Env, MatchRow } from "./types";

// Régression : football-data (plan gratuit) peut renvoyer un match déjà FINISHED
// avec un score `null` (le statut passe avant la publication du score, ou la
// source "flappe"). L'upsert ne doit JAMAIS écraser un score réel par un null,
// sinon on perd le résultat final et `recalculateAllPoints` remet tout le monde
// à 0 point. Voir le bug du 1er match CDM 2026 (Mexique 2-0, points effacés).

let mf: Miniflare;
let env: Env;

async function applyMigration(): Promise<void> {
  for (const sql of [migration, matchGroupMigration]) {
    for (const statement of sql.split(";")) {
      const trimmed = statement.trim();
      if (trimmed) await env.DB.prepare(trimmed).run();
    }
  }
}

async function upsertMatch(values: {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  winnerCode: string | null;
}): Promise<void> {
  // Colonnes sans `venue` (hasVenue=false) pour rester aligné sur la migration 0001.
  await env.DB.prepare(buildMatchUpsertSql(false))
    .bind(
      "fd_1",
      "1",
      "Mexico",
      "South Africa",
      "2026-06-11T19:00:00Z",
      "GROUP_STAGE",
      "GROUP_A",
      values.status,
      values.homeScore,
      values.awayScore,
      values.winnerTeam,
      values.winnerCode,
      "2026-06-11T22:00:00Z"
    )
    .run();
}

async function readMatch(): Promise<MatchRow> {
  return (await env.DB.prepare("SELECT * FROM matches WHERE id = 'fd_1'").first<MatchRow>())!;
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
  await env.DB.prepare("DROP TABLE IF EXISTS matches").run();
  await applyMigration();
});

describe("upsert football-data : protection du score final", () => {
  it("ne réécrit pas un score réel quand la source renvoie un score null", async () => {
    // 1) Le match se termine 2-0, victoire Mexico (sync correcte).
    await upsertMatch({
      status: "FINISHED",
      homeScore: 2,
      awayScore: 0,
      winnerTeam: "Mexico",
      winnerCode: "HOME_TEAM"
    });

    // 2) Une sync suivante renvoie le même match FINISHED mais sans score (flap).
    await upsertMatch({
      status: "FINISHED",
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      winnerCode: null
    });

    const match = await readMatch();
    expect(match.home_score).toBe(2);
    expect(match.away_score).toBe(0);
    expect(match.winner_team).toBe("Mexico");
    expect(match.winner_code).toBe("HOME_TEAM");
  });

  it("applique une correction de score non-null (2-0 -> 2-1)", async () => {
    await upsertMatch({
      status: "FINISHED",
      homeScore: 2,
      awayScore: 0,
      winnerTeam: "Mexico",
      winnerCode: "HOME_TEAM"
    });
    // Correction légitime de la source : un score non-null doit bien passer.
    await upsertMatch({
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      winnerTeam: "Mexico",
      winnerCode: "HOME_TEAM"
    });

    const match = await readMatch();
    expect(match.home_score).toBe(2);
    expect(match.away_score).toBe(1);
  });

  it("met bien à jour le statut même quand le score reste null", async () => {
    await upsertMatch({
      status: "TIMED",
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      winnerCode: null
    });
    await upsertMatch({
      status: "IN_PLAY",
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      winnerCode: null
    });

    expect((await readMatch()).status).toBe("IN_PLAY");
  });
});
