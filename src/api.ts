export type User = {
  id: string;
  pseudo: string;
  isAdmin?: boolean;
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
  inviteCode: string | null;
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
  group: string | null;
  venue: string | null;
  tvChannels: Array<{ key: string; label: string }>;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  lastSyncedAt: string;
  locked: boolean;
  prediction: Prediction | null;
  // Scores les plus pronostiqués par la ligue (présent uniquement sur les matchs
  // terminés renvoyés par /api/results).
  leaguePredictions?: ScorelineCount[];
};

export type ScorelineCount = {
  home: number;
  away: number;
  count: number;
};

export type ProgressionPoint = {
  matchId: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  me: number;
  leader: number;
  average: number;
};

export type Progression = {
  leaderUserId: string | null;
  leaderPseudo: string | null;
  playerCount: number;
  points: ProgressionPoint[];
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
const PUBLIC_WORKER_API_BASE = "https://prono-cdm-api.volatix-prono-cdm.workers.dev";
const SESSION_TOKEN_STORAGE_KEY = "prono-cdm-session-token";

// Emis quand une requete authentifiee est rejetee (401) alors qu'on se croyait
// connecte : l'app ecoute cet event pour basculer proprement vers l'ecran de
// connexion au lieu de laisser un "Reessayer" sans issue.
export const SESSION_EXPIRED_EVENT = "pcdm:session-expired";

export function resolveApiBase(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
  configuredApiBase = CONFIGURED_API_BASE
): string {
  if (hostname.endsWith(".vercel.app")) {
    return configuredApiBase || PUBLIC_WORKER_API_BASE;
  }
  return configuredApiBase;
}

function apiBase(): string {
  return resolveApiBase();
}

// Le token de session (fallback bearer) est stocke en localStorage pour survivre
// a la fermeture du navigateur et aux nouveaux onglets : sur les navigateurs qui
// bloquent les cookies tiers (Safari/iOS, Firefox, Chrome recent), le cookie
// cross-domain n'arrive pas au Worker et ce bearer est la seule auth persistante.
// Le cookie HttpOnly reste le mecanisme primaire quand le navigateur l'accepte.
function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  if (stored) return stored;
  // Migration douce depuis l'ancien stockage sessionStorage : on reprend le token
  // d'une session en cours pour ne pas deconnecter l'utilisateur.
  const legacy = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  if (legacy) {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, legacy);
    window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    return legacy;
  }
  return "";
}

export function setApiSessionToken(token: string | null, force = false): void {
  if (typeof window === "undefined") return;
  if (token && (force || apiBase())) {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  }
  window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const sessionToken = getSessionToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers as Record<string, string> | undefined)
  };
  const hasAuthorization = Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
  if (sessionToken && !hasAuthorization) {
    headers.authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    headers
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    // Session perdue/expiree sur une route authentifiee : on nettoie le token et
    // on previent l'app pour qu'elle renvoie vers la connexion. On exclut les
    // routes d'auth pour ne pas confondre avec un "PIN incorrect" du login.
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      setApiSessionToken(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
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
