export type User = {
  id: string;
  pseudo: string;
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
  rank: number;
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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
