export type User = {
  id: string;
  pseudo: string;
};

export type Profile = {
  photoUrl: string;
  tagline: string;
  favoriteTeam: string;
  updatedAt?: string | null;
};

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

export type ProfileStats = {
  submittedPredictions: number;
  totalMatches: number;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  goalDiffBonuses: number;
  averagePoints: number;
  successRate: number;
  groupPoints: number;
  knockoutPoints: number;
};

export type GroupMember = {
  userId: string;
  pseudo: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type Group = {
  id: string;
  name: string;
  ownerUserId: string;
  ownerPseudo: string;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  createdAt: string;
  members?: GroupMember[];
};

export type Prediction = {
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedWinnerTeam: string | null;
  points: number;
  exactScore: boolean;
  correctResult: boolean;
  correctGoalDiff: boolean;
  updatedAt: string;
};

export type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage: string;
  stageKind: "GROUP" | "KNOCKOUT";
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  lastSyncedAt: string;
  locked: boolean;
  prediction: Prediction | null;
};

export type LeaderboardRow = {
  userId: string;
  pseudo: string;
  points: number;
  exactScores: number;
  correctResults: number;
  correctGoalDiffs: number;
  rank: number;
  rankChange: number;
  recentForm: Array<"exact" | "correct" | "bonus" | "miss">;
  photoUrl: string;
  tagline: string;
  favoriteTeam: string;
  submittedPredictions: number;
  averagePoints: number;
  successRate: number;
};

export type ActivityItem = {
  id: string;
  type: string;
  message: string;
  created_at: string;
};

export type SyncStatus = {
  status: "never_run" | "running" | "success" | "failed" | "missing_token";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSyncedMatches: number;
};

const CONFIGURED_API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function apiBase(): string {
  if (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".vercel.app")
  ) {
    return "";
  }
  return CONFIGURED_API_BASE;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...options.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Erreur réseau ou serveur.";
    throw new Error(
      message
    );
  }

  return payload as T;
}
