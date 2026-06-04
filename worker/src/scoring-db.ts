import { scorePrediction, type Winner } from "../../src/shared/scoring";
import type { Env, MatchRow, PredictionRow } from "./types";

type JoinedPrediction = PredictionRow &
  Pick<
    MatchRow,
    "home_team" | "away_team" | "home_score" | "away_score" | "stage" | "winner_code"
  > & {
    pseudo: string;
  };

type LeaderRow = {
  user_id: string;
  pseudo: string;
  points: number;
  exact_scores: number;
  correct_results: number;
  goal_diffs: number;
};

type StreakRow = {
  user_id: string;
  pseudo: string;
  match_id: string;
  exact_score: number;
  correct_result: number;
  kickoff_at: string;
};

function isSuccessful(row: Pick<PredictionRow, "exact_score" | "correct_result">): boolean {
  return Boolean(row.exact_score || row.correct_result);
}

async function insertActivity(
  env: Env,
  type: string,
  userId: string | null,
  matchId: string | null,
  message: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO activity_feed (id, type, user_id, match_id, message)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), type, userId, matchId, message)
    .run();
}

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
    .bind(key, value)
    .run();
}

async function recordLeaderActivity(env: Env): Promise<void> {
  const [leader, previousLeader, latestFinishedMatch] = await Promise.all([
    env.DB.prepare(
      `SELECT users.id AS user_id, users.pseudo,
              COALESCE(SUM(predictions.points), 0) AS points,
              COALESCE(SUM(CASE WHEN predictions.exact_score = 1 THEN 1 ELSE 0 END), 0) AS exact_scores,
              COALESCE(SUM(CASE WHEN predictions.correct_result = 1 AND predictions.exact_score = 0 THEN 1 ELSE 0 END), 0) AS correct_results,
              COALESCE(SUM(CASE WHEN predictions.correct_goal_diff = 1 AND predictions.exact_score = 0 THEN 1 ELSE 0 END), 0) AS goal_diffs
       FROM users
       LEFT JOIN predictions ON predictions.user_id = users.id
       GROUP BY users.id, users.pseudo
       ORDER BY points DESC, exact_scores DESC, correct_results DESC, goal_diffs DESC, users.pseudo ASC
       LIMIT 1`
    ).first<LeaderRow>(),
    env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'activity_current_leader_user_id' LIMIT 1"
    ).first<{ value: string }>(),
    env.DB.prepare(
      "SELECT id FROM matches WHERE status IN ('FINISHED', 'AWARDED') ORDER BY kickoff_at DESC LIMIT 1"
    ).first<{ id: string }>()
  ]);

  if (!leader || !latestFinishedMatch || leader.points <= 0) return;
  if (previousLeader?.value !== leader.user_id) {
    await insertActivity(
      env,
      "new_leader",
      leader.user_id,
      latestFinishedMatch.id,
      `${leader.pseudo} prend la tête du classement avec ${leader.points} points`
    );
    await setSetting(env, "activity_current_leader_user_id", leader.user_id);
  }
}

async function recordStreakActivity(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT users.id AS user_id, users.pseudo, predictions.match_id,
            predictions.exact_score, predictions.correct_result, matches.kickoff_at
     FROM users
     JOIN predictions ON predictions.user_id = users.id
     JOIN matches ON matches.id = predictions.match_id
     WHERE matches.status IN ('FINISHED', 'AWARDED')
     ORDER BY users.id ASC, matches.kickoff_at DESC`
  ).all<StreakRow>();
  const rowsByUser = new Map<string, StreakRow[]>();

  for (const row of rows.results ?? []) {
    rowsByUser.set(row.user_id, [...(rowsByUser.get(row.user_id) ?? []), row]);
  }

  for (const userRows of rowsByUser.values()) {
    let streak = 0;
    for (const row of userRows) {
      if (!isSuccessful(row)) break;
      streak += 1;
    }

    const latestRow = userRows[0];
    if (latestRow && streak >= 3) {
      await insertActivity(
        env,
        "correct_streak",
        latestRow.user_id,
        latestRow.match_id,
        `${latestRow.pseudo} enchaîne ${streak} bons résultats`
      );
    }
  }
}

export async function recalculateAllPoints(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT predictions.*, users.pseudo, matches.home_team, matches.away_team,
            matches.home_score, matches.away_score, matches.stage, matches.winner_code
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id
     JOIN users ON users.id = predictions.user_id`
  ).all<JoinedPrediction>();

  for (const row of rows.results ?? []) {
    const previousExact = Boolean(row.exact_score);
    const breakdown = scorePrediction(
      {
        stage: row.stage,
        homeScore: row.home_score,
        awayScore: row.away_score,
        winner: row.winner_code as Winner
      },
      {
        predictedHomeScore: row.predicted_home_score,
        predictedAwayScore: row.predicted_away_score,
        predictedWinner: row.predicted_winner_code as Winner
      }
    );

    await env.DB.prepare(
      `UPDATE predictions
       SET points = ?, exact_score = ?, correct_result = ?, correct_goal_diff = ?,
           updated_at = updated_at
       WHERE id = ?`
    )
      .bind(
        breakdown.points,
        breakdown.exactScore ? 1 : 0,
        breakdown.correctResult ? 1 : 0,
        breakdown.correctGoalDiff ? 1 : 0,
        row.id
      )
      .run();

    if (breakdown.exactScore && !previousExact) {
      await insertActivity(
        env,
        "exact_score",
        row.user_id,
        row.match_id,
        `${row.pseudo} a trouvé le score exact de ${row.home_team} - ${row.away_team}`
      );
    }
  }

  await recordLeaderActivity(env);
  await recordStreakActivity(env);
}
