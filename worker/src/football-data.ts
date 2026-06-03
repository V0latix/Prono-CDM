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
    fullTime?: {
      home: number | null;
      away: number | null;
    };
  };
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
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

export async function syncFootballData(env: Env): Promise<{
  synced: number;
  error?: string;
}> {
  if (!env.FOOTBALL_DATA_TOKEN) {
    return { synced: 0, error: "FOOTBALL_DATA_TOKEN manquant." };
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
    await env.DB.prepare(
      `INSERT INTO activity_feed (id, type, message)
       VALUES (?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        "sync_error",
        `La synchronisation football-data.org a échoué (${response.status}).`
      )
      .run();
    return { synced: 0, error: body || `HTTP ${response.status}` };
  }

  const payload = (await response.json()) as FootballDataResponse;
  const now = new Date().toISOString();
  let synced = 0;

  for (const match of payload.matches ?? []) {
    const homeTeam = teamName(match.homeTeam, "Équipe à définir");
    const awayTeam = teamName(match.awayTeam, "Équipe à définir");
    const homeScore = match.score?.fullTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? null;
    const winner = match.score?.winner ?? null;

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
        `fd_${match.id}`,
        String(match.id),
        homeTeam,
        awayTeam,
        match.utcDate,
        match.stage || match.group || "GROUP_STAGE",
        match.status,
        homeScore,
        awayScore,
        winnerTeam(winner, homeTeam, awayTeam),
        winner,
        now
      )
      .run();
    synced += 1;
  }

  await recalculateAllPoints(env);
  return { synced };
}
