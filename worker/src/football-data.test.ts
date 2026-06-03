import { describe, expect, it } from "vitest";
import { normalizeFootballDataMatch } from "./football-data";

type RawFootballDataMatch = Parameters<typeof normalizeFootballDataMatch>[0];

describe("football-data normalization", () => {
  it("maps a scheduled group match into the local match model", () => {
    const normalized = normalizeFootballDataMatch({
      id: 391001,
      utcDate: "2026-06-11T19:00:00Z",
      status: "SCHEDULED",
      stage: "GROUP_STAGE",
      homeTeam: { name: "Mexico", shortName: "Mexico", tla: "MEX" },
      awayTeam: { name: "South Africa", shortName: "South Africa", tla: "RSA" },
      score: {
        winner: null,
        duration: "REGULAR",
        fullTime: { home: null, away: null }
      }
    } satisfies RawFootballDataMatch);

    expect(normalized).toEqual({
      id: "fd_391001",
      externalId: "391001",
      homeTeam: "Mexico",
      awayTeam: "South Africa",
      kickoffAt: "2026-06-11T19:00:00Z",
      stage: "GROUP_STAGE",
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      winnerCode: null
    });
  });

  it("keeps the qualified winner from football-data for knockout matches", () => {
    const normalized = normalizeFootballDataMatch({
      id: 391099,
      utcDate: "2026-07-19T19:00:00Z",
      status: "FINISHED",
      stage: "FINAL",
      homeTeam: { name: "France" },
      awayTeam: { name: "Argentina" },
      score: {
        winner: "AWAY_TEAM",
        duration: "PENALTY_SHOOTOUT",
        regularTime: { home: 1, away: 1 },
        fullTime: { home: 1, away: 1 }
      }
    } satisfies RawFootballDataMatch);

    expect(normalized).toMatchObject({
      stage: "FINAL",
      status: "FINISHED",
      homeScore: 1,
      awayScore: 1,
      winnerTeam: "Argentina",
      winnerCode: "AWAY_TEAM"
    });
  });

  it("falls back to group and placeholder team names when teams are not known yet", () => {
    const normalized = normalizeFootballDataMatch({
      id: 391050,
      utcDate: "2026-06-30T19:00:00Z",
      status: "TIMED",
      group: "GROUP_B",
      homeTeam: {},
      awayTeam: undefined,
      score: {}
    } satisfies RawFootballDataMatch);

    expect(normalized).toMatchObject({
      homeTeam: "Équipe à définir",
      awayTeam: "Équipe à définir",
      stage: "GROUP_B"
    });
  });
});
