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
    | "locker_room_vibe"
    | "points_100"
    | "exact_10"
    | "exact_20"
    | "exact_30"
    | "last_place"
    | "final_exact"
    | "group_stage_first"
    | "perfect_streak_2_days";
  label: string;
  description: string;
  earned: boolean;
};

type BadgePredictionRow = PredictionRow & {
  status: string;
  kickoff_at: string;
  stage: string;
  home_team: string;
  away_team: string;
};

type StandingRow = {
  user_id: string;
  total_points: number;
  group_points: number;
};

type GroupStageRow = {
  group_total: number;
  group_finished: number;
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

async function getPerfectDays(env: Env, userId: string): Promise<string[]> {
  const days = await env.DB.prepare(
    `SELECT substr(kickoff_at, 1, 10) AS day, COUNT(*) AS match_count
     FROM matches
     WHERE status IN ('FINISHED', 'AWARDED')
     GROUP BY substr(kickoff_at, 1, 10)
     HAVING COUNT(*) >= 2`
  ).all<PerfectDayRow>();

  const perfectDays: string[] = [];
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
      perfectDays.push(day.day);
    }
  }

  return perfectDays;
}

// Deux journees calendaires "sans faute" qui se suivent (ecart d'exactement 1 jour).
function hasConsecutivePerfectDays(days: string[]): boolean {
  const sorted = [...days].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Date.parse(`${sorted[index - 1]}T00:00:00.000Z`);
    const current = Date.parse(`${sorted[index]}T00:00:00.000Z`);
    if (
      Number.isFinite(previous) &&
      Number.isFinite(current) &&
      current - previous === 86_400_000
    ) {
      return true;
    }
  }
  return false;
}

// La phase de poules est terminee quand tous ses matchs sont joues (et qu'il y en a).
async function isGroupStageComplete(env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN stage = 'GROUP_STAGE' THEN 1 ELSE 0 END) AS group_total,
       SUM(CASE WHEN stage = 'GROUP_STAGE' AND status IN ('FINISHED', 'AWARDED') THEN 1 ELSE 0 END) AS group_finished
     FROM matches`
  ).first<GroupStageRow>();
  const total = Number(row?.group_total ?? 0);
  const finished = Number(row?.group_finished ?? 0);
  return total > 0 && total === finished;
}

// Classement global (dernier) et classement des poules (premier) calcules en une requete.
async function getStandingBadges(
  env: Env,
  userId: string,
  groupStageComplete: boolean
): Promise<{ lastPlace: boolean; groupFirst: boolean }> {
  const standings = await env.DB.prepare(
    `SELECT predictions.user_id AS user_id,
            SUM(predictions.points) AS total_points,
            SUM(CASE WHEN matches.stage = 'GROUP_STAGE' THEN predictions.points ELSE 0 END) AS group_points
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id
     WHERE matches.status IN ('FINISHED', 'AWARDED')
     GROUP BY predictions.user_id`
  ).all<StandingRow>();
  const rows = standings.results ?? [];
  const me = rows.find((row) => row.user_id === userId);
  if (!me) return { lastPlace: false, groupFirst: false };

  const totals = rows.map((row) => Number(row.total_points));
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  // Dernier seulement s'il y a au moins deux joueurs et un vrai ecart (pas tous a egalite).
  const lastPlace =
    rows.length >= 2 && Number(me.total_points) === minTotal && maxTotal > minTotal;

  const groupTotals = rows.map((row) => Number(row.group_points));
  const maxGroup = Math.max(...groupTotals);
  const groupFirst =
    groupStageComplete && maxGroup > 0 && Number(me.group_points) === maxGroup;

  return { lastPlace, groupFirst };
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
    `SELECT predictions.*, matches.status, matches.kickoff_at, matches.stage, matches.home_team, matches.away_team
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
  const perfectDays = await getPerfectDays(env, userId);
  const perfectDay = perfectDays.length >= 1;
  const perfectStreak2 = hasConsecutivePerfectDays(perfectDays);
  const rivalryStarted = await hasViewedAnotherProfile(env, userId);

  const totalPoints = rows
    .filter((row) => isFinished(row.status))
    .reduce((sum, row) => sum + row.points, 0);
  const exactCount = rows.filter(
    (row) => isFinished(row.status) && row.exact_score
  ).length;
  const finalExact = rows.some(
    (row) => isFinished(row.status) && row.stage === "FINAL" && row.exact_score
  );
  const groupStageComplete = await isGroupStageComplete(env);
  const { lastPlace, groupFirst } = await getStandingBadges(
    env,
    userId,
    groupStageComplete
  );

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
    },
    {
      id: "points_100",
      label: "Centenaire",
      description: "A dépassé la barre des 100 points.",
      earned: totalPoints >= 100
    },
    {
      id: "exact_10",
      label: "10 scores exacts",
      description: "A trouvé dix scores exacts.",
      earned: exactCount >= 10
    },
    {
      id: "exact_20",
      label: "20 scores exacts",
      description: "A trouvé vingt scores exacts.",
      earned: exactCount >= 20
    },
    {
      id: "exact_30",
      label: "30 scores exacts",
      description: "A trouvé trente scores exacts.",
      earned: exactCount >= 30
    },
    {
      id: "final_exact",
      label: "Prophète de la finale",
      description: "A trouvé le score exact de la finale.",
      earned: finalExact
    },
    {
      id: "group_stage_first",
      label: "Roi des poules",
      description: "A terminé la phase de poules en tête du classement.",
      earned: groupFirst
    },
    {
      id: "perfect_streak_2_days",
      label: "Sans faute deux jours de suite",
      description: "A réussi tous ses pronos deux journées d'affilée.",
      earned: perfectStreak2
    },
    {
      id: "last_place",
      label: "Lanterne rouge",
      description: "A occupé la dernière place du classement.",
      earned: lastPlace
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
