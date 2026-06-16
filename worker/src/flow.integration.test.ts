import { describe, expect, it } from "vitest";
import { getUserFromSession } from "./auth";
import { errorResponse, type RequestContext } from "./http";
import { route } from "./routes";
import { recalculateAllPoints } from "./scoring-db";
import { createMemoryDb, type MemoryDb } from "./test-db";

// Parcours complet de bout en bout sur un faux D1 a etat partage :
// inscription -> prono -> score du match -> classement. Contrairement aux suites
// unitaires (scoring, standings...) qui testent une brique isolee, ce test fait
// transiter une vraie donnee par les vrais handlers et verifie que les points et
// le rang en ressortent corrects.

async function call(
  memory: MemoryDb,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const request = new Request(`https://api.test${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const ctx: RequestContext = {
    request,
    env: memory.env,
    url: new URL(request.url),
    user: await getUserFromSession(request, memory.env)
  };
  let response: Response;
  try {
    response = await route(ctx);
  } catch (error) {
    response = errorResponse(request, memory.env, error);
  }
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function futureMatch(): Record<string, unknown> {
  return {
    id: "m1",
    external_id: "1",
    home_team: "France",
    away_team: "Bresil",
    kickoff_at: "2026-12-01T18:00:00.000Z",
    stage: "GROUP_STAGE",
    match_group: "GROUP_A",
    venue: null,
    status: "TIMED",
    home_score: null,
    away_score: null,
    winner_team: null,
    winner_code: null,
    last_synced_at: "2026-06-16T00:00:00.000Z"
  };
}

describe("parcours complet inscription -> prono -> score -> classement", () => {
  it("propage un score exact en points et en tete du classement", async () => {
    const memory = createMemoryDb({ matches: [futureMatch()] });

    // 1. Inscription de deux joueurs.
    const register = (pseudo: string) =>
      call(memory, "POST", "/api/auth/register", { body: { pseudo, pin: "1234" } });
    const dede = await register("Dede");
    const lea = await register("Lea");
    expect(dede.status).toBe(200);
    expect(lea.status).toBe(200);
    const dedeToken = dede.body.sessionToken as string;
    const leaToken = lea.body.sessionToken as string;
    expect(dedeToken).toBeTruthy();

    // 2. Pronos : Dede vise juste (2-1), Lea se trompe (0-0).
    const dedePrediction = await call(memory, "PUT", "/api/predictions/m1", {
      token: dedeToken,
      body: { predictedHomeScore: 2, predictedAwayScore: 1 }
    });
    expect(dedePrediction.status).toBe(200);
    const leaPrediction = await call(memory, "PUT", "/api/predictions/m1", {
      token: leaToken,
      body: { predictedHomeScore: 0, predictedAwayScore: 0 }
    });
    expect(leaPrediction.status).toBe(200);

    // 3. Le match est joue : France 2 - 1 Bresil.
    const match = memory.tables.matches.find((m) => m.id === "m1")!;
    Object.assign(match, {
      status: "FINISHED",
      home_score: 2,
      away_score: 1,
      winner_team: "France",
      winner_code: "HOME_TEAM"
    });
    await recalculateAllPoints(memory.env);

    // 4. Classement : Dede (score exact = 5 pts) devant Lea (0 pt).
    const leaderboard = await call(memory, "GET", "/api/leaderboard", { token: dedeToken });
    expect(leaderboard.status).toBe(200);
    const rows = leaderboard.body.leaderboard as Array<{
      userId: string;
      pseudo: string;
      points: number;
      rank: number;
      exactScores: number;
    }>;
    const dedeRow = rows.find((r) => r.pseudo === "Dede")!;
    const leaRow = rows.find((r) => r.pseudo === "Lea")!;

    expect(dedeRow.points).toBe(5);
    expect(dedeRow.exactScores).toBe(1);
    expect(dedeRow.rank).toBe(1);
    expect(leaRow.points).toBe(0);
    expect(leaRow.rank).toBe(2);

    // 5. Le score exact a bien alimente le feed d'activite, pour Dede.
    const exactActivity = memory.tables.activity_feed.find((a) => a.type === "exact_score");
    expect(exactActivity?.user_id).toBe(dedeRow.userId);
  });

  it("refuse un prono apres le coup d'envoi (verrouillage cote serveur)", async () => {
    const locked = { ...futureMatch(), id: "m2", kickoff_at: "2026-06-01T18:00:00.000Z" };
    const memory = createMemoryDb({ matches: [locked] });
    const dede = await call(memory, "POST", "/api/auth/register", {
      body: { pseudo: "Dede", pin: "1234" }
    });

    const result = await call(memory, "PUT", "/api/predictions/m2", {
      token: dede.body.sessionToken as string,
      body: { predictedHomeScore: 1, predictedAwayScore: 0 }
    });

    expect(result.status).toBe(409);
  });
});
