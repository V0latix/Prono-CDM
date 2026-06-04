import type { Env, PredictionRow } from "./types";

export type ProfileBadge = {
  id: "first_exact" | "correct_streak_3" | "last_minute" | "perfect_day";
  label: string;
  description: string;
  earned: boolean;
};

type BadgePredictionRow = PredictionRow & {
  status: string;
  kickoff_at: string;
};

type DayMatchRow = {
  day: string;
  match_count: number;
};

function isFinished(status: string): boolean {
  return ["FINISHED", "AWARDED"].includes(status);
}

function isSuccessful(row: Pick<PredictionRow, "exact_score" | "correct_result">): boolean {
  return Boolean(row.exact_score || row.correct_result);
}

function hasThreeResultStreak(rows: BadgePredictionRow[]): boolean {
  let streak = 0;
  for (const row of rows) {
    if (!isFinished(row.status)) continue;
    if (isSuccessful(row)) {
      streak += 1;
      if (streak >= 3) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function hasLastMinutePrediction(rows: BadgePredictionRow[]): boolean {
  return rows.some((row) => {
    const updatedAt = Date.parse(row.updated_at);
    const kickoffAt = Date.parse(row.kickoff_at);
    if (!Number.isFinite(updatedAt) || !Number.isFinite(kickoffAt)) return false;
    const minutesBeforeKickoff = (kickoffAt - updatedAt) / 60_000;
    return minutesBeforeKickoff >= 0 && minutesBeforeKickoff <= 60;
  });
}

async function hasPerfectDay(env: Env, userId: string): Promise<boolean> {
  const days = await env.DB.prepare(
    `SELECT substr(kickoff_at, 1, 10) AS day, COUNT(*) AS match_count
     FROM matches
     WHERE status IN ('FINISHED', 'AWARDED')
     GROUP BY substr(kickoff_at, 1, 10)
     HAVING COUNT(*) >= 2`
  ).all<DayMatchRow>();

  for (const day of days.results ?? []) {
    const predictions = await env.DB.prepare(
      `SELECT predictions.*
       FROM matches
       LEFT JOIN predictions
         ON predictions.match_id = matches.id AND predictions.user_id = ?
       WHERE matches.status IN ('FINISHED', 'AWARDED')
         AND substr(matches.kickoff_at, 1, 10) = ?`
    )
      .bind(userId, day.day)
      .all<PredictionRow>();
    const rows = predictions.results ?? [];
    if (
      rows.length === day.match_count &&
      rows.every((row) => row.id && isSuccessful(row))
    ) {
      return true;
    }
  }

  return false;
}

export async function getUserBadges(env: Env, userId: string): Promise<ProfileBadge[]> {
  const predictions = await env.DB.prepare(
    `SELECT predictions.*, matches.status, matches.kickoff_at
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id
     WHERE predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(userId)
    .all<BadgePredictionRow>();
  const rows = predictions.results ?? [];
  const firstExact = rows.some((row) => isFinished(row.status) && row.exact_score);
  const streak = hasThreeResultStreak(rows);
  const lastMinute = hasLastMinutePrediction(rows);
  const perfectDay = await hasPerfectDay(env, userId);

  return [
    {
      id: "first_exact",
      label: "Premier score exact",
      description: "A trouvé au moins un score exact.",
      earned: firstExact
    },
    {
      id: "correct_streak_3",
      label: "Série de 3 bons résultats",
      description: "A enchaîné trois matchs réussis.",
      earned: streak
    },
    {
      id: "last_minute",
      label: "Dernière minute",
      description: "A posé un prono dans l'heure avant le coup d'envoi.",
      earned: lastMinute
    },
    {
      id: "perfect_day",
      label: "Sans faute sur une journée",
      description: "A réussi tous les matchs d'une journée terminée.",
      earned: perfectDay
    }
  ];
}
