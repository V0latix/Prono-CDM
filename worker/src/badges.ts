import type { Env, PredictionRow } from "./types";

export type ProfileBadge = {
  id:
    | "first_exact"
    | "correct_streak_3"
    | "last_minute"
    | "perfect_day"
    | "good_student"
    | "madame_irma"
    | "black_cat"
    | "emotional_var"
    | "ruthless"
    | "wild_optimist"
    | "rivalry_started"
    | "locker_room_vibe";
  label: string;
  description: string;
  earned: boolean;
};

type BadgePredictionRow = PredictionRow & {
  status: string;
  kickoff_at: string;
  home_team: string;
  away_team: string;
};

type DayMatchRow = {
  id: string;
  day: string;
  kickoff_at: string;
  prediction_id: string | null;
  updated_at: string | null;
};

type PerfectDayRow = {
  day: string;
  match_count: number;
};

function isFinished(status: string): boolean {
  return ["FINISHED", "AWARDED"].includes(status);
}

function isSuccessful(row: Pick<PredictionRow, "exact_score" | "correct_result">): boolean {
  return Boolean(row.exact_score || row.correct_result);
}

function normalizeTeamName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function hasStreak(
  rows: BadgePredictionRow[],
  count: number,
  predicate: (row: BadgePredictionRow) => boolean
): boolean {
  let streak = 0;
  for (const row of rows) {
    if (!isFinished(row.status)) continue;
    if (predicate(row)) {
      streak += 1;
      if (streak >= count) return true;
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

function hasEmotionalVar(rows: BadgePredictionRow[]): boolean {
  return rows.some((row) => {
    if (row.created_at === row.updated_at) return false;
    const updatedAt = Date.parse(row.updated_at);
    const kickoffAt = Date.parse(row.kickoff_at);
    if (!Number.isFinite(updatedAt) || !Number.isFinite(kickoffAt)) return false;
    const minutesBeforeKickoff = (kickoffAt - updatedAt) / 60_000;
    return minutesBeforeKickoff >= 0 && minutesBeforeKickoff <= 60;
  });
}

function hasWildOptimist(rows: BadgePredictionRow[]): boolean {
  return rows.some((row) => row.predicted_home_score + row.predicted_away_score >= 5);
}

async function hasRuthlessPrediction(
  env: Env,
  userId: string,
  rows: BadgePredictionRow[]
): Promise<boolean> {
  const profile = await env.DB.prepare(
    "SELECT favorite_team FROM user_profiles WHERE user_id = ? LIMIT 1"
  )
    .bind(userId)
    .first<{ favorite_team: string }>();
  const favoriteTeam = normalizeTeamName(profile?.favorite_team);
  if (!favoriteTeam) return false;

  return rows.some((row) => {
    if (row.points <= 0) return false;
    const homeTeam = normalizeTeamName(row.home_team);
    const awayTeam = normalizeTeamName(row.away_team);
    const predictedWinner = normalizeTeamName(row.predicted_winner_team);
    const favoritePlayed = favoriteTeam === homeTeam || favoriteTeam === awayTeam;
    return favoritePlayed && predictedWinner && predictedWinner !== "match nul" && predictedWinner !== favoriteTeam;
  });
}

async function hasGoodStudentDay(env: Env, userId: string): Promise<boolean> {
  const rows = await env.DB.prepare(
    `SELECT matches.id, substr(matches.kickoff_at, 1, 10) AS day, matches.kickoff_at,
            predictions.id AS prediction_id, predictions.updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(userId)
    .all<DayMatchRow>();

  const matchesByDay = new Map<string, DayMatchRow[]>();
  for (const row of rows.results ?? []) {
    const dayRows = matchesByDay.get(row.day) ?? [];
    dayRows.push(row);
    matchesByDay.set(row.day, dayRows);
  }

  for (const dayRows of matchesByDay.values()) {
    if (dayRows.length < 2) continue;
    const completedBeforeKickoff = dayRows.every((row) => {
      if (!row.prediction_id || !row.updated_at) return false;
      const updatedAt = Date.parse(row.updated_at);
      const kickoffAt = Date.parse(row.kickoff_at);
      return Number.isFinite(updatedAt) && Number.isFinite(kickoffAt) && updatedAt <= kickoffAt;
    });
    if (completedBeforeKickoff) return true;
  }

  return false;
}

async function hasPerfectDay(env: Env, userId: string): Promise<boolean> {
  const days = await env.DB.prepare(
    `SELECT substr(kickoff_at, 1, 10) AS day, COUNT(*) AS match_count
     FROM matches
     WHERE status IN ('FINISHED', 'AWARDED')
     GROUP BY substr(kickoff_at, 1, 10)
     HAVING COUNT(*) >= 2`
  ).all<PerfectDayRow>();

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

async function hasViewedAnotherProfile(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT viewed_user_id FROM profile_views WHERE viewer_user_id = ? LIMIT 1"
  )
    .bind(userId)
    .first<{ viewed_user_id: string }>();
  return Boolean(row);
}

export async function getUserBadges(env: Env, userId: string): Promise<ProfileBadge[]> {
  const predictions = await env.DB.prepare(
    `SELECT predictions.*, matches.status, matches.kickoff_at, matches.home_team, matches.away_team
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id
     WHERE predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(userId)
    .all<BadgePredictionRow>();
  const rows = predictions.results ?? [];
  const firstExact = rows.some((row) => isFinished(row.status) && row.exact_score);
  const streak = hasStreak(rows, 3, isSuccessful);
  const madameIrma = hasStreak(rows, 2, (row) => Boolean(row.exact_score));
  const blackCat = hasStreak(rows, 5, (row) => !isSuccessful(row));
  const lastMinute = hasLastMinutePrediction(rows);
  const emotionalVar = hasEmotionalVar(rows);
  const wildOptimist = hasWildOptimist(rows);
  const ruthless = await hasRuthlessPrediction(env, userId, rows);
  const goodStudent = await hasGoodStudentDay(env, userId);
  const perfectDay = await hasPerfectDay(env, userId);
  const rivalryStarted = await hasViewedAnotherProfile(env, userId);

  const badges: ProfileBadge[] = [
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
      id: "good_student",
      label: "Bon élève",
      description: "A fait tous ses pronos d'une journée avant le coup d'envoi.",
      earned: goodStudent
    },
    {
      id: "madame_irma",
      label: "Madame Irma",
      description: "A trouvé deux scores exacts d'affilée.",
      earned: madameIrma
    },
    {
      id: "black_cat",
      label: "Le chat noir",
      description: "A raté cinq pronos d'affilée.",
      earned: blackCat
    },
    {
      id: "last_minute",
      label: "Dernière minute",
      description: "A posé un prono dans l'heure avant le coup d'envoi.",
      earned: lastMinute
    },
    {
      id: "emotional_var",
      label: "VAR émotionnelle",
      description: "A changé un prono dans la dernière heure avant le coup d'envoi.",
      earned: emotionalVar
    },
    {
      id: "ruthless",
      label: "Le sans-pitié",
      description: "A pronostiqué contre son équipe favorite et gagné des points.",
      earned: ruthless
    },
    {
      id: "wild_optimist",
      label: "L'optimiste fou",
      description: "A pronostiqué un match avec au moins cinq buts.",
      earned: wildOptimist
    },
    {
      id: "perfect_day",
      label: "Sans faute sur une journée",
      description: "A réussi tous les matchs d'une journée terminée.",
      earned: perfectDay
    },
    {
      id: "rivalry_started",
      label: "Rivalité lancée",
      description: "A consulté le profil d'un autre joueur depuis le classement.",
      earned: rivalryStarted
    }
  ];

  badges.push({
    id: "locker_room_vibe",
    label: "Ambiance vestiaire",
    description: "A obtenu au moins trois badges.",
    earned: badges.filter((badge) => badge.earned).length >= 3
  });

  return badges;
}
