import { scorePrediction, type Winner } from "../../src/shared/scoring";
import type { Env, MatchRow, PredictionRow } from "./types";

type JoinedPrediction = PredictionRow &
  Pick<
    MatchRow,
    "home_team" | "away_team" | "home_score" | "away_score" | "stage" | "winner_code"
  > & {
    pseudo: string;
  };

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
      await env.DB.prepare(
        `INSERT OR IGNORE INTO activity_feed (id, type, user_id, match_id, message)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          "exact_score",
          row.user_id,
          row.match_id,
          `${row.pseudo} a trouvé le score exact de ${row.home_team} - ${row.away_team}`
        )
        .run();
    }
  }
}
