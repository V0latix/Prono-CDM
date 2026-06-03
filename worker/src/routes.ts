import {
  getStageKind,
  normalizePredictionWinner,
  resultFromScore,
  type Winner
} from "../../src/shared/scoring";
import {
  clearSessionCookie,
  createSession,
  deleteCurrentSession,
  hashPin,
  normalizePseudo,
  serializeSessionCookie,
  validatePin,
  verifyPin
} from "./auth";
import { syncFootballData } from "./football-data";
import { HttpError, json, parseJson, requireUser, type RequestContext } from "./http";
import type { MatchRow, PredictionRow, User } from "./types";

type AuthPayload = {
  pseudo?: string;
  pin?: string;
  inviteCode?: string;
};

type PredictionPayload = {
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  predictedWinnerTeam?: string | null;
};

type LeaderboardRow = {
  userId: string;
  pseudo: string;
  points: number;
  exactScores: number;
  correctResults: number;
  rank: number;
};

function assertMethod(ctx: RequestContext, method: string): void {
  if (ctx.request.method !== method) {
    throw new HttpError(405, "Méthode non autorisée.");
  }
}

async function getInviteCode(ctx: RequestContext): Promise<string> {
  const setting = await ctx.env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'league_invite_code'"
  ).first<{ value: string }>();
  return setting?.value ?? ctx.env.INVITE_CODE ?? "CDM2026";
}

function asScore(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 30) {
    throw new HttpError(400, `${field} doit être un entier entre 0 et 30.`);
  }
  return value as number;
}

function assertPin(pin: string): void {
  try {
    validatePin(pin);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Code PIN invalide."
    );
  }
}

function isFinished(status: string): boolean {
  return ["FINISHED", "AWARDED"].includes(status);
}

function isLocked(match: MatchRow): boolean {
  return Date.parse(match.kickoff_at) <= Date.now();
}

function publicMatch(match: MatchRow, prediction?: PredictionRow | null) {
  return {
    id: match.id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    kickoffAt: match.kickoff_at,
    stage: match.stage,
    stageKind: getStageKind(match.stage),
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    winnerTeam: match.winner_team,
    lastSyncedAt: match.last_synced_at,
    locked: isLocked(match),
    prediction: prediction
      ? {
          predictedHomeScore: prediction.predicted_home_score,
          predictedAwayScore: prediction.predicted_away_score,
          predictedWinnerTeam: prediction.predicted_winner_team,
          points: prediction.points,
          exactScore: Boolean(prediction.exact_score),
          correctResult: Boolean(prediction.correct_result),
          correctGoalDiff: Boolean(prediction.correct_goal_diff),
          updatedAt: prediction.updated_at
        }
      : null
  };
}

async function register(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const body = await parseJson<AuthPayload>(ctx.request);
  const pseudo = normalizePseudo(body.pseudo ?? "");
  const pin = body.pin ?? "";
  const inviteCode = body.inviteCode?.trim() ?? "";

  if (pseudo.length < 2 || pseudo.length > 32) {
    throw new HttpError(400, "Le pseudo doit contenir 2 à 32 caractères.");
  }
  assertPin(pin);
  if (inviteCode !== (await getInviteCode(ctx))) {
    throw new HttpError(403, "Code d'invitation invalide.");
  }

  const userId = crypto.randomUUID();
  try {
    await ctx.env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash) VALUES (?, ?, ?)"
    )
      .bind(userId, pseudo, await hashPin(pin))
      .run();
  } catch {
    throw new HttpError(409, "Ce pseudo est déjà utilisé.");
  }

  const token = await createSession(ctx.env, userId);
  return json(
    ctx.request,
    ctx.env,
    { user: { id: userId, pseudo } },
    {
      headers: {
        "Set-Cookie": serializeSessionCookie(ctx.request, ctx.env, token)
      }
    }
  );
}

async function login(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const body = await parseJson<AuthPayload>(ctx.request);
  const pseudo = normalizePseudo(body.pseudo ?? "");
  const pin = body.pin ?? "";
  assertPin(pin);

  const user = await ctx.env.DB.prepare(
    "SELECT id, pseudo, pin_hash, created_at FROM users WHERE pseudo = ? LIMIT 1"
  )
    .bind(pseudo)
    .first<User & { pin_hash: string }>();

  if (!user || !(await verifyPin(pin, user.pin_hash))) {
    throw new HttpError(401, "Pseudo ou PIN incorrect.");
  }

  const token = await createSession(ctx.env, user.id);
  return json(
    ctx.request,
    ctx.env,
    { user: { id: user.id, pseudo: user.pseudo, createdAt: user.created_at } },
    {
      headers: {
        "Set-Cookie": serializeSessionCookie(ctx.request, ctx.env, token)
      }
    }
  );
}

async function logout(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  await deleteCurrentSession(ctx.request, ctx.env);
  return json(
    ctx.request,
    ctx.env,
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(ctx.request, ctx.env) } }
  );
}

async function me(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  return json(ctx.request, ctx.env, { user: ctx.user });
}

async function listMatches(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return json(ctx.request, ctx.env, {
    matches: (rows.results ?? []).map((row) => {
      const match = row as unknown as MatchRow;
      const prediction = row.prediction_id
        ? ({
            id: row.prediction_id,
            user_id: user.id,
            match_id: match.id,
            predicted_home_score: row.predicted_home_score,
            predicted_away_score: row.predicted_away_score,
            predicted_winner_team: row.predicted_winner_team,
            predicted_winner_code: row.predicted_winner_code,
            points: row.points,
            exact_score: row.exact_score,
            correct_result: row.correct_result,
            correct_goal_diff: row.correct_goal_diff,
            created_at: row.prediction_created_at,
            updated_at: row.prediction_updated_at
          } as PredictionRow)
        : null;
      return publicMatch(match, prediction);
    })
  });
}

async function savePrediction(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "PUT");
  const user = requireUser(ctx);
  const matchId = ctx.url.pathname.split("/").at(-1);
  if (!matchId) throw new HttpError(400, "Match manquant.");

  const match = await ctx.env.DB.prepare("SELECT * FROM matches WHERE id = ?")
    .bind(matchId)
    .first<MatchRow>();
  if (!match) throw new HttpError(404, "Match introuvable.");
  if (isLocked(match)) {
    throw new HttpError(409, "Ce match est verrouillé depuis le coup d'envoi.");
  }

  const body = await parseJson<PredictionPayload>(ctx.request);
  const predictedHomeScore = asScore(body.predictedHomeScore, "Score domicile");
  const predictedAwayScore = asScore(body.predictedAwayScore, "Score extérieur");
  const stageKind = getStageKind(match.stage);
  const scoreWinner = resultFromScore(predictedHomeScore, predictedAwayScore);
  let predictedWinnerCode: Winner = scoreWinner;
  let predictedWinnerTeam: string | null = null;

  if (stageKind === "KNOCKOUT" && scoreWinner === "DRAW") {
    if (
      body.predictedWinnerTeam !== match.home_team &&
      body.predictedWinnerTeam !== match.away_team
    ) {
      throw new HttpError(
        400,
        "Pour un nul en élimination directe, choisis l'équipe qualifiée."
      );
    }
    predictedWinnerTeam = body.predictedWinnerTeam;
    predictedWinnerCode =
      body.predictedWinnerTeam === match.home_team ? "HOME_TEAM" : "AWAY_TEAM";
  } else if (stageKind === "KNOCKOUT") {
    predictedWinnerTeam =
      normalizePredictionWinner(
        {
          predictedHomeScore,
          predictedAwayScore,
          predictedWinner: null
        },
        stageKind
      ) === "HOME_TEAM"
        ? match.home_team
        : match.away_team;
  } else {
    predictedWinnerCode = scoreWinner;
    predictedWinnerTeam = scoreWinner === "DRAW"
      ? "Match nul"
      : scoreWinner === "HOME_TEAM"
        ? match.home_team
        : match.away_team;
  }

  await ctx.env.DB.prepare(
    `INSERT INTO predictions (
       id, user_id, match_id, predicted_home_score, predicted_away_score,
       predicted_winner_team, predicted_winner_code, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       predicted_home_score = excluded.predicted_home_score,
       predicted_away_score = excluded.predicted_away_score,
       predicted_winner_team = excluded.predicted_winner_team,
       predicted_winner_code = excluded.predicted_winner_code,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      match.id,
      predictedHomeScore,
      predictedAwayScore,
      predictedWinnerTeam,
      predictedWinnerCode
    )
    .run();

  const prediction = await ctx.env.DB.prepare(
    "SELECT * FROM predictions WHERE user_id = ? AND match_id = ?"
  )
    .bind(user.id, match.id)
    .first<PredictionRow>();

  return json(ctx.request, ctx.env, { match: publicMatch(match, prediction) });
}

async function leaderboard(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  requireUser(ctx);
  const phase = ctx.url.searchParams.get("phase") ?? "general";
  const users = await ctx.env.DB.prepare(
    "SELECT id, pseudo, created_at FROM users ORDER BY created_at ASC"
  ).all<User>();
  const rows = await ctx.env.DB.prepare(
    `SELECT predictions.*, matches.stage
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id`
  ).all<PredictionRow & { stage: string }>();
  const byUser = new Map<string, LeaderboardRow>();

  for (const user of users.results ?? []) {
    byUser.set(user.id, {
      userId: user.id,
      pseudo: user.pseudo,
      points: 0,
      exactScores: 0,
      correctResults: 0,
      rank: 0
    });
  }

  for (const row of rows.results ?? []) {
    const stageKind = getStageKind(row.stage);
    if (phase === "groups" && stageKind !== "GROUP") continue;
    if (phase === "knockout" && stageKind !== "KNOCKOUT") continue;
    const target = byUser.get(row.user_id);
    if (!target) continue;
    target.points += row.points;
    target.exactScores += row.exact_score ? 1 : 0;
    target.correctResults += row.correct_result && !row.exact_score ? 1 : 0;
  }

  const ranking = [...byUser.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
    return a.pseudo.localeCompare(b.pseudo, "fr");
  });
  ranking.forEach((row, index) => {
    row.rank = index + 1;
  });

  return json(ctx.request, ctx.env, { leaderboard: ranking, phase });
}

async function dashboard(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const matchesResponse = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     WHERE matches.kickoff_at >= ?
     ORDER BY matches.kickoff_at ASC
     LIMIT 6`
  )
    .bind(user.id, new Date().toISOString())
    .all<Record<string, unknown>>();
  const leaderboardResponse = await leaderboard(ctx);
  const leaderboardData = (await leaderboardResponse.json()) as {
    leaderboard: LeaderboardRow[];
  };
  const activity = await ctx.env.DB.prepare(
    `SELECT activity_feed.*, users.pseudo
     FROM activity_feed
     LEFT JOIN users ON users.id = activity_feed.user_id
     ORDER BY activity_feed.created_at DESC
     LIMIT 8`
  ).all();
  const rank = leaderboardData.leaderboard.find((row) => row.userId === user.id);

  return json(ctx.request, ctx.env, {
    nextMatches: (matchesResponse.results ?? []).map((row) => {
      const match = row as unknown as MatchRow;
      const prediction = row.prediction_id
        ? ({
            id: row.prediction_id,
            user_id: user.id,
            match_id: match.id,
            predicted_home_score: row.predicted_home_score,
            predicted_away_score: row.predicted_away_score,
            predicted_winner_team: row.predicted_winner_team,
            predicted_winner_code: row.predicted_winner_code,
            points: row.points,
            exact_score: row.exact_score,
            correct_result: row.correct_result,
            correct_goal_diff: row.correct_goal_diff,
            created_at: row.prediction_created_at,
            updated_at: row.prediction_updated_at
          } as PredictionRow)
        : null;
      return publicMatch(match, prediction);
    }),
    rank,
    activity: activity.results ?? []
  });
}

async function results(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     WHERE matches.status IN ('FINISHED', 'AWARDED')
     ORDER BY matches.kickoff_at DESC`
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return json(ctx.request, ctx.env, {
    results: (rows.results ?? []).map((row) => {
      const match = row as unknown as MatchRow;
      const prediction = row.prediction_id
        ? ({
            id: row.prediction_id,
            user_id: user.id,
            match_id: match.id,
            predicted_home_score: row.predicted_home_score,
            predicted_away_score: row.predicted_away_score,
            predicted_winner_team: row.predicted_winner_team,
            predicted_winner_code: row.predicted_winner_code,
            points: row.points,
            exact_score: row.exact_score,
            correct_result: row.correct_result,
            correct_goal_diff: row.correct_goal_diff,
            created_at: row.prediction_created_at,
            updated_at: row.prediction_updated_at
          } as PredictionRow)
        : null;
      return publicMatch(match, prediction);
    })
  });
}

async function syncNow(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  if (ctx.env.ADMIN_TOKEN) {
    const auth = ctx.request.headers.get("authorization");
    if (auth !== `Bearer ${ctx.env.ADMIN_TOKEN}`) {
      throw new HttpError(403, "Jeton admin invalide.");
    }
  } else {
    requireUser(ctx);
  }

  return json(ctx.request, ctx.env, await syncFootballData(ctx.env));
}

export async function route(ctx: RequestContext): Promise<Response> {
  const { pathname } = ctx.url;
  if (pathname === "/api/health") {
    return json(ctx.request, ctx.env, { ok: true });
  }
  if (pathname === "/api/auth/register") return register(ctx);
  if (pathname === "/api/auth/login") return login(ctx);
  if (pathname === "/api/auth/logout") return logout(ctx);
  if (pathname === "/api/me") return me(ctx);
  if (pathname === "/api/dashboard") return dashboard(ctx);
  if (pathname === "/api/matches") return listMatches(ctx);
  if (pathname.startsWith("/api/predictions/")) return savePrediction(ctx);
  if (pathname === "/api/leaderboard") return leaderboard(ctx);
  if (pathname === "/api/results") return results(ctx);
  if (pathname === "/api/admin/sync") return syncNow(ctx);
  throw new HttpError(404, "Route introuvable.");
}
