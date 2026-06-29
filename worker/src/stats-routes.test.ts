// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { route } from "./routes";
import type { RequestContext } from "./http";
import type { Env, User } from "./types";
// Migrations réelles chargées en texte (`?raw`), comme scoring-db.test.ts. On
// applique juste celles dont les routes testées ont besoin : schéma de base,
// groupes, colonnes match_group et venue.
import initialMigration from "../../migrations/0001_initial.sql?raw";
import userProfilesMigration from "../../migrations/0002_user_profiles.sql?raw";
import cleanupProfilesMigration from "../../migrations/0003_cleanup_user_profiles.sql?raw";
import groupsMigration from "../../migrations/0005_groups.sql?raw";
import profileViewsMigration from "../../migrations/0007_profile_views.sql?raw";
import inviteCodesMigration from "../../migrations/0008_group_invite_codes.sql?raw";
import matchGroupMigration from "../../migrations/0010_match_group.sql?raw";
import venueMigration from "../../migrations/0011_match_venue.sql?raw";

// Test d'intégration sur D1 réelle (miniflare) : on rejoue le VRAI SQL des routes
// /api/results (scores les plus pronostiqués) et /api/stats/progression (courbe
// des points cumulés) pour valider le câblage SQL -> agrégation -> JSON.

const migrations = [
  initialMigration,
  userProfilesMigration,
  cleanupProfilesMigration,
  groupsMigration,
  profileViewsMigration,
  inviteCodesMigration,
  matchGroupMigration,
  venueMigration
];

let mf: Miniflare;
let env: Env;

const user: User = { id: "u1", pseudo: "Alice", created_at: "2026-06-01T00:00:00Z", is_admin: 0 };

async function applyMigrations(): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.split(";")) {
      const sql = statement.trim();
      if (sql) await env.DB.prepare(sql).run();
    }
  }
}

async function seedMatch(
  id: string,
  kickoff: string,
  home: number,
  away: number
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO matches (id, external_id, home_team, away_team, kickoff_at, stage,
       match_group, venue, status, home_score, away_score, winner_team, winner_code,
       last_synced_at)
     VALUES (?, ?, ?, ?, ?, 'GROUP_STAGE', 'GROUP_A', NULL, 'FINISHED', ?, ?, ?, 'HOME_TEAM',
       '2026-06-12T22:00:00Z')`
  )
    .bind(id, id, `${id}-home`, `${id}-away`, kickoff, home, away, `${id}-home`)
    .run();
}

async function seedPrediction(
  userId: string,
  matchId: string,
  home: number,
  away: number,
  points: number
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO predictions (id, user_id, match_id, predicted_home_score,
       predicted_away_score, predicted_winner_code, points)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  )
    .bind(`${userId}-${matchId}`, userId, matchId, home, away, points)
    .run();
}

function context(path: string): RequestContext {
  const request = new Request(`https://api.test${path}`, { method: "GET" });
  return { request, env, url: new URL(request.url), user };
}

beforeEach(async () => {
  // Une instance D1 neuve par test : évite les DROP TABLE en chaîne (contraintes
  // FK) et garantit une base propre.
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
    `INSERT INTO users (id, pseudo, pin_hash) VALUES
       ('u1','Alice','x'),('u2','Bob','x'),('u3','Lea','x')`
  ).run();
  // m1 (11 juin) puis m2 (12 juin), tous deux terminés.
  await seedMatch("m1", "2026-06-11T19:00:00Z", 2, 1);
  await seedMatch("m2", "2026-06-12T19:00:00Z", 0, 0);
  // u1: 2-1 / 1-0 ; u2: 2-1 / 0-0 ; u3: 1-0 / 2-2.
  await seedPrediction("u1", "m1", 2, 1, 3);
  await seedPrediction("u1", "m2", 1, 0, 0);
  await seedPrediction("u2", "m1", 2, 1, 5);
  await seedPrediction("u2", "m2", 0, 0, 4);
  await seedPrediction("u3", "m1", 1, 0, 0);
  await seedPrediction("u3", "m2", 2, 2, 2);
});

afterEach(async () => {
  await mf.dispose();
});

describe("/api/results : scores les plus pronostiqués par la ligue", () => {
  it("agrège les scores pronostiqués par match terminé", async () => {
    const res = await route(context("/api/results"));
    const body = (await res.json()) as {
      results: Array<{ id: string; leaguePredictions: Array<{ home: number; away: number; count: number }> }>;
    };
    const m1 = body.results.find((m) => m.id === "m1");
    expect(m1?.leaguePredictions).toEqual([
      { home: 2, away: 1, count: 2 },
      { home: 1, away: 0, count: 1 }
    ]);
    const m2 = body.results.find((m) => m.id === "m2");
    // Trois scores distincts à égalité (count 1) -> tri par home puis away.
    expect(m2?.leaguePredictions).toEqual([
      { home: 0, away: 0, count: 1 },
      { home: 1, away: 0, count: 1 },
      { home: 2, away: 2, count: 1 }
    ]);
  });
});

describe("/api/users/:id/profile : pronos passés du joueur", () => {
  it("ne renvoie que les pronos sur matchs terminés, du plus récent au plus ancien", async () => {
    // Match à venir + prono de Bob dessus : ne doit JAMAIS fuiter.
    await env.DB.prepare(
      `INSERT INTO matches (id, external_id, home_team, away_team, kickoff_at, stage,
         match_group, venue, status, last_synced_at)
       VALUES ('m3','m3','m3-home','m3-away','2026-07-01T19:00:00Z','GROUP_STAGE',
         'GROUP_A', NULL, 'TIMED', '2026-06-12T22:00:00Z')`
    ).run();
    await seedPrediction("u2", "m3", 1, 1, 0);

    const res = await route(context("/api/users/u2/profile"));
    const body = (await res.json()) as {
      predictions: Array<{ id: string; status: string; prediction: { predictedHomeScore: number } | null }>;
    };

    // m2 (12 juin) avant m1 (11 juin) ; m3 (à venir) exclu.
    expect(body.predictions.map((p) => p.id)).toEqual(["m2", "m1"]);
    expect(body.predictions.every((p) => p.status === "FINISHED")).toBe(true);
    expect(body.predictions[0].prediction?.predictedHomeScore).toBe(0);
  });
});

describe("/api/stats/progression : courbe des points cumulés", () => {
  it("renvoie moi, le leader et la moyenne cumulés dans l'ordre des matchs", async () => {
    const res = await route(context("/api/stats/progression"));
    const body = (await res.json()) as {
      progression: {
        leaderUserId: string | null;
        leaderPseudo: string | null;
        playerCount: number;
        points: Array<{ matchId: string; me: number; leader: number; average: number }>;
      };
    };
    const { progression } = body;
    expect(progression.leaderUserId).toBe("u2");
    expect(progression.leaderPseudo).toBe("Bob");
    expect(progression.playerCount).toBe(3);
    expect(progression.points.map((p) => p.matchId)).toEqual(["m1", "m2"]);
    expect(progression.points.map((p) => p.me)).toEqual([3, 3]);
    expect(progression.points.map((p) => p.leader)).toEqual([5, 9]);
    expect(progression.points[0].average).toBeCloseTo(8 / 3, 5);
    expect(progression.points[1].average).toBeCloseTo(14 / 3, 5);
  });

  it("renvoie une série vide quand aucun match n'est terminé", async () => {
    await env.DB.prepare("UPDATE matches SET status = 'TIMED'").run();
    const res = await route(context("/api/stats/progression"));
    const body = (await res.json()) as { progression: { points: unknown[]; leaderUserId: string | null } };
    expect(body.progression.points).toEqual([]);
  });

  it("filtre par groupe quand groupId est fourni", async () => {
    await env.DB.prepare(
      "INSERT INTO prediction_groups (id, name, owner_user_id) VALUES ('g1','Bureau','u1')"
    ).run();
    await env.DB.prepare(
      `INSERT INTO group_members (group_id, user_id, role) VALUES
         ('g1','u1','owner'),('g1','u3','member')`
    ).run();
    const res = await route(context("/api/stats/progression?groupId=g1"));
    const body = (await res.json()) as {
      progression: { leaderUserId: string | null; playerCount: number; points: Array<{ leader: number }> };
    };
    // u2 (Bob) hors groupe : le leader du groupe est u1 (Alice, total 3) vs u3 (total 2).
    expect(body.progression.leaderUserId).toBe("u1");
    expect(body.progression.playerCount).toBe(2);
  });
});
