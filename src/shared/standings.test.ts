import { describe, expect, it } from "vitest";
import {
  computeBestThirds,
  computeGroupStandings,
  isGroupStageComplete,
  type GroupStanding,
  type GroupStandingRow,
  type StandingsMatch
} from "./standings";

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

// Helper : fabrique une poule avec ses lignes deja classees (1er, 2e, 3e, 4e).
function group(name: string, rows: Array<Partial<GroupStandingRow> & { team: string }>): GroupStanding {
  return {
    group: name,
    rows: rows.map((row) => ({
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
      ...row
    }))
  };
}

describe("computeBestThirds", () => {
  it("retourne des ensembles vides sans classement", () => {
    const best = computeBestThirds([]);
    expect(best.qualified.size).toBe(0);
    expect(best.contested.size).toBe(0);
  });

  it("ignore les poules sans 3e (moins de trois equipes classees)", () => {
    const standings = [group("GROUP_A", [{ team: "France" }, { team: "Canada" }])];
    expect(computeBestThirds(standings).qualified.size).toBe(0);
  });

  it("garde les `count` meilleurs 3es classes par points puis diff puis buts", () => {
    // Quatre poules, chacune avec un 3e de niveau decroissant. On en garde 2.
    const standings = [
      group("GROUP_A", [
        { team: "A1", points: 9 },
        { team: "A2", points: 6 },
        { team: "A3", points: 5, goalDiff: 2 } // meilleur 3e
      ]),
      group("GROUP_B", [
        { team: "B1", points: 9 },
        { team: "B2", points: 6 },
        { team: "B3", points: 5, goalDiff: 1 } // 2e meilleur 3e (diff inferieure)
      ]),
      group("GROUP_C", [
        { team: "C1", points: 9 },
        { team: "C2", points: 6 },
        { team: "C3", points: 3 } // ecarte
      ]),
      group("GROUP_D", [
        { team: "D1", points: 9 },
        { team: "D2", points: 6 },
        { team: "D3", points: 1 } // ecarte
      ])
    ];

    const best = computeBestThirds(standings, 2);
    expect(best.qualified).toEqual(new Set(["A3", "B3"]));
    expect(best.contested.size).toBe(0);
  });

  it("se limite au nombre de 3es disponibles", () => {
    const standings = [
      group("GROUP_A", [{ team: "A1" }, { team: "A2" }, { team: "A3", points: 4 }]),
      group("GROUP_B", [{ team: "B1" }, { team: "B2" }, { team: "B3", points: 2 }])
    ];
    expect(computeBestThirds(standings, 8).qualified).toEqual(new Set(["A3", "B3"]));
  });

  it("ne tranche pas un ex aequo a la frontiere par le nom d'equipe", () => {
    // 8e et 9e 3es a egalite parfaite (points, diff, buts) : aucun n'est qualifie
    // d'office, les deux sont "a departager" et ne sont jamais classes par nom.
    const standings = [
      ...Array.from({ length: 7 }, (_, i) =>
        group(`GROUP_${i}`, [
          { team: `${i}-1`, points: 9 },
          { team: `${i}-2`, points: 6 },
          { team: `${i}-3`, points: 5, goalDiff: 3 } // 7 meilleurs 3es, garantis
        ])
      ),
      group("GROUP_Y", [
        { team: "Y1", points: 9 },
        { team: "Y2", points: 6 },
        { team: "Zorro", points: 5, goalDiff: 1, goalsFor: 2 } // ex aequo
      ]),
      group("GROUP_Z", [
        { team: "Z1", points: 9 },
        { team: "Z2", points: 6 },
        { team: "Albanie", points: 5, goalDiff: 1, goalsFor: 2 } // ex aequo
      ])
    ];

    const best = computeBestThirds(standings, 8);
    // Les 7 premiers sont garantis ; la 8e place est disputee entre Zorro et Albanie.
    expect(best.qualified.size).toBe(7);
    expect(best.qualified.has("Zorro")).toBe(false);
    expect(best.qualified.has("Albanie")).toBe(false);
    expect(best.contested).toEqual(new Set(["Zorro", "Albanie"]));
  });

  it("classe un ex aequo hors frontiere comme qualifie (places garanties)", () => {
    // Deux 3es a egalite parfaite mais aux rangs 1-2 sur 8 places : aucun risque,
    // les deux sont garantis qualifies.
    const standings = [
      group("GROUP_A", [
        { team: "A1", points: 9 },
        { team: "A2", points: 6 },
        { team: "Egal1", points: 5, goalDiff: 1, goalsFor: 2 }
      ]),
      group("GROUP_B", [
        { team: "B1", points: 9 },
        { team: "B2", points: 6 },
        { team: "Egal2", points: 5, goalDiff: 1, goalsFor: 2 }
      ])
    ];

    const best = computeBestThirds(standings, 8);
    expect(best.qualified).toEqual(new Set(["Egal1", "Egal2"]));
    expect(best.contested.size).toBe(0);
  });
});

describe("isGroupStageComplete", () => {
  // Poule de 4 equipes ayant chacune joue ses 3 matchs.
  function fullGroup(name: string): GroupStanding {
    return group(name, [
      { team: `${name}-1`, played: 3 },
      { team: `${name}-2`, played: 3 },
      { team: `${name}-3`, played: 3 },
      { team: `${name}-4`, played: 3 }
    ]);
  }

  it("est faux tant qu'il manque des poules", () => {
    const standings = Array.from({ length: 11 }, (_, i) => fullGroup(`G${i}`));
    expect(isGroupStageComplete(standings)).toBe(false);
  });

  it("est faux si une poule n'a pas fini ses matchs", () => {
    const standings = Array.from({ length: 12 }, (_, i) => fullGroup(`G${i}`));
    standings[5].rows[0].played = 2; // une equipe n'a joue que 2 matchs
    expect(isGroupStageComplete(standings)).toBe(false);
  });

  it("est vrai quand les 12 poules ont joue tous leurs matchs", () => {
    const standings = Array.from({ length: 12 }, (_, i) => fullGroup(`G${i}`));
    expect(isGroupStageComplete(standings)).toBe(true);
  });
});
