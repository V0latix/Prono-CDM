import { describe, expect, it } from "vitest";
import { computeGroupStandings, type StandingsMatch } from "./standings";

function m(overrides: Partial<StandingsMatch>): StandingsMatch {
  return {
    group: "GROUP_A",
    homeTeam: "France",
    awayTeam: "Canada",
    homeScore: 1,
    awayScore: 0,
    status: "FINISHED",
    ...overrides
  };
}

describe("computeGroupStandings", () => {
  it("retourne une liste vide sans match", () => {
    expect(computeGroupStandings([])).toEqual([]);
  });

  it("attribue 3 points pour une victoire, 0 pour une defaite", () => {
    const [groupA] = computeGroupStandings([
      m({ homeTeam: "France", awayTeam: "Canada", homeScore: 2, awayScore: 0 })
    ]);
    expect(groupA.group).toBe("GROUP_A");
    expect(groupA.rows[0]).toMatchObject({
      team: "France",
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 0,
      goalDiff: 2,
      points: 3
    });
    expect(groupA.rows[1]).toMatchObject({
      team: "Canada",
      lost: 1,
      points: 0,
      goalDiff: -2
    });
  });

  it("attribue 1 point a chaque equipe pour un nul", () => {
    const [groupA] = computeGroupStandings([
      m({ homeTeam: "France", awayTeam: "Canada", homeScore: 1, awayScore: 1 })
    ]);
    expect(groupA.rows.every((r) => r.points === 1 && r.drawn === 1)).toBe(true);
  });

  it("classe par points puis difference de buts puis buts marques", () => {
    // France 6pts (2 victoires), Maroc 4pts (V 3-0 + N 0-0), Canada 1pt (N).
    // Maroc devance Canada a egalite d'aucun critere ici : Maroc a plus de points.
    const [groupA] = computeGroupStandings([
      m({ homeTeam: "France", awayTeam: "Canada", homeScore: 1, awayScore: 0 }),
      m({ homeTeam: "France", awayTeam: "Maroc", homeScore: 1, awayScore: 0 }),
      m({ homeTeam: "Maroc", awayTeam: "Canada", homeScore: 3, awayScore: 0 }),
      m({ homeTeam: "Canada", awayTeam: "Maroc", homeScore: 0, awayScore: 0 })
    ]);
    expect(groupA.rows.map((r) => r.team)).toEqual(["France", "Maroc", "Canada"]);
  });

  it("ignore les matchs de phase finale (group null)", () => {
    const standings = computeGroupStandings([
      m({ group: null, homeTeam: "France", awayTeam: "Bresil" })
    ]);
    expect(standings).toEqual([]);
  });

  it("ignore les matchs non termines ou sans score", () => {
    const standings = computeGroupStandings([
      m({ status: "SCHEDULED", homeScore: null, awayScore: null }),
      m({ status: "IN_PLAY", homeScore: 1, awayScore: 1 })
    ]);
    expect(standings).toEqual([]);
  });

  it("compte le statut AWARDED", () => {
    const [groupA] = computeGroupStandings([m({ status: "AWARDED" })]);
    expect(groupA.rows.find((r) => r.team === "France")?.points).toBe(3);
  });

  it("separe et ordonne plusieurs poules", () => {
    const standings = computeGroupStandings([
      m({ group: "GROUP_B", homeTeam: "Bresil", awayTeam: "Serbie" }),
      m({ group: "GROUP_A", homeTeam: "France", awayTeam: "Canada" })
    ]);
    expect(standings.map((s) => s.group)).toEqual(["GROUP_A", "GROUP_B"]);
  });
});
