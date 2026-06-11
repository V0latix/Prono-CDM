import { describe, expect, it } from "vitest";
import { buildMatchUpsertSql, normalizeFootballDataMatch } from "./football-data";

type RawFootballDataMatch = Parameters<typeof normalizeFootballDataMatch>[0];

describe("football-data normalization", () => {
  it("maps a scheduled group match into the local match model", () => {
    const normalized = normalizeFootballDataMatch({
      id: 391001,
      utcDate: "2026-06-11T19:00:00Z",
      status: "SCHEDULED",
      stage: "GROUP_STAGE",
      group: "GROUP_A",
      venue: "Estadio Azteca",
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
      group: "GROUP_A",
      venue: "Estadio Azteca",
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      winnerCode: null
    });
  });

  it("inclut la colonne venue dans l'upsert quand elle existe", () => {
    const sql = buildMatchUpsertSql(true);
    expect(sql).toContain("venue");
    expect(sql).toContain("venue = excluded.venue");
    // 14 colonnes -> 14 placeholders.
    expect(sql.match(/\?/g)).toHaveLength(14);
  });

  it("omet la colonne venue quand elle n'existe pas encore (skew migration)", () => {
    const sql = buildMatchUpsertSql(false);
    expect(sql).not.toContain("venue");
    // 13 colonnes -> 13 placeholders, la synchro reste fonctionnelle.
    expect(sql.match(/\?/g)).toHaveLength(13);
    // Ne met jamais a jour la cle de conflit.
    expect(sql).not.toContain("external_id = excluded");
  });

  it("met venue a null quand football-data ne le fournit pas", () => {
    const normalized = normalizeFootballDataMatch({
      id: 391002,
      utcDate: "2026-06-12T19:00:00Z",
      status: "SCHEDULED",
      stage: "GROUP_STAGE",
      group: "GROUP_C",
      homeTeam: { name: "Japan" },
      awayTeam: { name: "Senegal" },
      score: {}
    } satisfies RawFootballDataMatch);

    expect(normalized.venue).toBeNull();
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
      group: null,
      status: "FINISHED",
      homeScore: 1,
      awayScore: 1,
      winnerTeam: "Argentina",
      winnerCode: "AWAY_TEAM"
    });
  });

  it("keeps the group stage and the group letter separate for group matches", () => {
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
      stage: "GROUP_STAGE",
      group: "GROUP_B"
    });
  });
});
