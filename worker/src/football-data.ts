import type { Winner } from "../../src/shared/scoring";
import { runD1Batch } from "./d1-batch";
import { recalculateAllPoints } from "./scoring-db";
import type { Env } from "./types";

type FootballDataTeam = {
  name?: string;
  shortName?: string;
  tla?: string;
};

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string;
  group?: string | null;
  venue?: string | null;
  homeTeam?: FootballDataTeam;
  awayTeam?: FootballDataTeam;
  score?: {
    winner?: Winner;
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null;
    fullTime?: {
      home: number | null;
      away: number | null;
    };
    regularTime?: {
      home: number | null;
      away: number | null;
    };
  };
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
};

export type SyncStatus = {
  status: "never_run" | "running" | "success" | "failed" | "missing_token";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSyncedMatches: number;
};

export type NormalizedFootballDataMatch = {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage: string;
  group: string | null;
  venue: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  winnerCode: Winner;
};

function teamName(team: FootballDataTeam | undefined, fallback: string): string {
  return team?.name || team?.shortName || team?.tla || fallback;
}

function winnerTeam(
  winner: Winner | undefined,
  homeTeam: string,
  awayTeam: string
): string | null {
  if (winner === "HOME_TEAM") return homeTeam;
  if (winner === "AWAY_TEAM") return awayTeam;
  if (winner === "DRAW") return "Match nul";
  return null;
}

function truncateError(value: string): string {
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
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

async function setSyncStatus(
  env: Env,
  status: SyncStatus["status"],
  values: Partial<SyncStatus> = {}
): Promise<void> {
  const writes = [
    setSetting(env, "football_data_sync_status", status),
    values.lastStartedAt !== undefined
      ? setSetting(env, "football_data_last_started_at", values.lastStartedAt ?? "")
      : Promise.resolve(),
    values.lastFinishedAt !== undefined
      ? setSetting(env, "football_data_last_finished_at", values.lastFinishedAt ?? "")
      : Promise.resolve(),
    values.lastSuccessAt !== undefined
      ? setSetting(env, "football_data_last_success_at", values.lastSuccessAt ?? "")
      : Promise.resolve(),
    values.lastError !== undefined
      ? setSetting(env, "football_data_last_error", values.lastError ?? "")
      : Promise.resolve(),
    values.lastSyncedMatches !== undefined
      ? setSetting(
          env,
          "football_data_last_synced_matches",
          String(values.lastSyncedMatches)
        )
      : Promise.resolve()
  ];

  await Promise.all(writes);
}

export async function getFootballDataSyncStatus(env: Env): Promise<SyncStatus> {
  const rows = await env.DB.prepare(
    `SELECT key, value
     FROM settings
     WHERE key IN (
       'football_data_sync_status',
       'football_data_last_started_at',
       'football_data_last_finished_at',
       'football_data_last_success_at',
       'football_data_last_error',
       'football_data_last_synced_matches'
     )`
  ).all<{ key: string; value: string }>();
  const settings = new Map(
    (rows.results ?? []).map((row) => [row.key, row.value])
  );
  const rawSyncedMatches = Number(settings.get("football_data_last_synced_matches") ?? 0);

  return {
    status:
      (settings.get("football_data_sync_status") as SyncStatus["status"] | undefined) ??
      "never_run",
    lastStartedAt: settings.get("football_data_last_started_at") || null,
    lastFinishedAt: settings.get("football_data_last_finished_at") || null,
    lastSuccessAt: settings.get("football_data_last_success_at") || null,
    lastError: settings.get("football_data_last_error") || null,
    lastSyncedMatches: Number.isFinite(rawSyncedMatches) ? rawSyncedMatches : 0
  };
}

export function normalizeFootballDataMatch(
  match: FootballDataMatch
): NormalizedFootballDataMatch {
  const homeTeam = teamName(match.homeTeam, "Équipe à définir");
  const awayTeam = teamName(match.awayTeam, "Équipe à définir");
  const winner = match.score?.winner ?? null;

  return {
    id: `fd_${match.id}`,
    externalId: String(match.id),
    homeTeam,
    awayTeam,
    kickoffAt: match.utcDate,
    stage: match.stage || "GROUP_STAGE",
    group: match.group ?? null,
    venue: match.venue ?? null,
    status: match.status,
    homeScore: match.score?.fullTime?.home ?? null,
    awayScore: match.score?.fullTime?.away ?? null,
    winnerTeam: winnerTeam(winner, homeTeam, awayTeam),
    winnerCode: winner
  };
}

// Ordre des colonnes de l'upsert des matchs. `venue` est conditionnel pour rester
// compatible avec une base qui n'a pas encore recu la migration 0011 (fenetre de
// skew migration/deploy) : on n'ecrit la colonne que si elle existe vraiment.
function matchUpsertColumns(hasVenue: boolean): string[] {
  return [
    "id",
    "external_id",
    "home_team",
    "away_team",
    "kickoff_at",
    "stage",
    "match_group",
    ...(hasVenue ? ["venue"] : []),
    "status",
    "home_score",
    "away_score",
    "winner_team",
    "winner_code",
    "last_synced_at"
  ];
}

// Colonnes de resultat protegees contre l'ecrasement par un null. football-data
// (plan gratuit) peut renvoyer un match deja FINISHED avec un score `null` (statut
// publie avant le score, ou source qui "flappe"). Sans cette protection, l'upsert
// effacerait le score final reel et `recalculateAllPoints` remettrait tout le monde
// a 0 point. COALESCE(excluded.x, x) garde la valeur stockee quand la source est
// null, tout en laissant passer une correction non-null (ex: 2-0 -> 2-1).
const PRESERVE_IF_NULL_COLUMNS = new Set([
  "home_score",
  "away_score",
  "winner_team",
  "winner_code"
]);

// Construit l'upsert des matchs (pur, testable). Met a jour toutes les colonnes
// sauf la cle de conflit `external_id` et l'`id`. Les colonnes de resultat ne sont
// jamais remplacees par un null (voir PRESERVE_IF_NULL_COLUMNS).
export function buildMatchUpsertSql(hasVenue: boolean): string {
  const columns = matchUpsertColumns(hasVenue);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((column) => column !== "id" && column !== "external_id")
    .map((column) =>
      PRESERVE_IF_NULL_COLUMNS.has(column)
        ? `${column} = COALESCE(excluded.${column}, ${column})`
        : `${column} = excluded.${column}`
    )
    .join(", ");
  return `INSERT INTO matches (${columns.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT(external_id) DO UPDATE SET ${updates}`;
}

// Vrai si la colonne `venue` existe deja dans `matches`. Permet a la synchro de
// fonctionner (et de continuer a recalculer les points) meme si le Worker tourne
// avant l'application de la migration 0011.
async function matchesHasVenueColumn(env: Env): Promise<boolean> {
  const info = await env.DB.prepare("PRAGMA table_info(matches)").all<{ name: string }>();
  return (info.results ?? []).some((column) => column.name === "venue");
}

export async function syncFootballData(env: Env): Promise<{
  synced: number;
  status: SyncStatus;
  error?: string;
}> {
  const startedAt = new Date().toISOString();
  await setSyncStatus(env, "running", {
    lastStartedAt: startedAt,
    lastError: null
  });

  if (!env.FOOTBALL_DATA_TOKEN) {
    const finishedAt = new Date().toISOString();
    const error = "FOOTBALL_DATA_TOKEN manquant.";
    await setSyncStatus(env, "missing_token", {
      lastFinishedAt: finishedAt,
      lastError: error,
      lastSyncedMatches: 0
    });
    return {
      synced: 0,
      status: await getFootballDataSyncStatus(env),
      error
    };
  }

  const baseUrl = env.FOOTBALL_DATA_BASE_URL ?? "https://api.football-data.org";
  const competition = env.FOOTBALL_DATA_COMPETITION ?? "WC";
  const url = new URL(`/v4/competitions/${competition}/matches`, baseUrl);
  if (env.FOOTBALL_DATA_SEASON) {
    url.searchParams.set("season", env.FOOTBALL_DATA_SEASON);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = truncateError(body || `HTTP ${response.status}`);
    await setSyncStatus(env, "failed", {
      lastFinishedAt: new Date().toISOString(),
      lastError: error,
      lastSyncedMatches: 0
    });
    return {
      synced: 0,
      status: await getFootballDataSyncStatus(env),
      error
    };
  }

  const payload = (await response.json()) as FootballDataResponse;
  const now = new Date().toISOString();
  // Compatibilite migration/deploy : si la colonne `venue` n'existe pas encore,
  // on la saute pour ne pas faire echouer toute la synchro (et le recalcul des
  // points qui suit). Elle sera remplie a la synchro suivant la migration.
  const hasVenue = await matchesHasVenueColumn(env);
  const upsertSql = buildMatchUpsertSql(hasVenue);

  // On batche tous les upserts (un aller-retour par lot) au lieu d'awaiter chaque
  // ecriture : ~100 upserts sequentiels depassaient le budget d'execution du cron
  // et la boucle mourait avant `recalculateAllPoints` (les points ne se calculaient
  // plus). Voir worker/src/d1-batch.ts.
  const statements = (payload.matches ?? []).map((match) => {
    const normalized = normalizeFootballDataMatch(match);
    const values = [
      normalized.id,
      normalized.externalId,
      normalized.homeTeam,
      normalized.awayTeam,
      normalized.kickoffAt,
      normalized.stage,
      normalized.group,
      ...(hasVenue ? [normalized.venue] : []),
      normalized.status,
      normalized.homeScore,
      normalized.awayScore,
      normalized.winnerTeam,
      normalized.winnerCode,
      now
    ];
    return env.DB.prepare(upsertSql).bind(...values);
  });

  await runD1Batch(env, statements);
  const synced = statements.length;

  await recalculateAllPoints(env);
  await setSyncStatus(env, "success", {
    lastFinishedAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    lastSyncedMatches: synced
  });
  return { synced, status: await getFootballDataSyncStatus(env) };
}
