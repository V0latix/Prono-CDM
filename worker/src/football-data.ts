import type { Winner } from "../../src/shared/scoring";
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
    stage: match.stage || match.group || "GROUP_STAGE",
    status: match.status,
    homeScore: match.score?.fullTime?.home ?? null,
    awayScore: match.score?.fullTime?.away ?? null,
    winnerTeam: winnerTeam(winner, homeTeam, awayTeam),
    winnerCode: winner
  };
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
  let synced = 0;

  for (const match of payload.matches ?? []) {
    const normalized = normalizeFootballDataMatch(match);

    await env.DB.prepare(
      `INSERT INTO matches (
         id, external_id, home_team, away_team, kickoff_at, stage, status,
         home_score, away_score, winner_team, winner_code, last_synced_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         home_team = excluded.home_team,
         away_team = excluded.away_team,
         kickoff_at = excluded.kickoff_at,
         stage = excluded.stage,
         status = excluded.status,
         home_score = excluded.home_score,
         away_score = excluded.away_score,
         winner_team = excluded.winner_team,
         winner_code = excluded.winner_code,
         last_synced_at = excluded.last_synced_at`
    )
      .bind(
        normalized.id,
        normalized.externalId,
        normalized.homeTeam,
        normalized.awayTeam,
        normalized.kickoffAt,
        normalized.stage,
        normalized.status,
        normalized.homeScore,
        normalized.awayScore,
        normalized.winnerTeam,
        normalized.winnerCode,
        now
      )
      .run();
    synced += 1;
  }

  await recalculateAllPoints(env);
  await setSyncStatus(env, "success", {
    lastFinishedAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    lastSyncedMatches: synced
  });
  return { synced, status: await getFootballDataSyncStatus(env) };
}
