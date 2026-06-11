import { describe, expect, it } from "vitest";
import { buildBracketRounds, knockoutRoundOrder, type BracketMatchInput } from "./bracket";

function km(overrides: Partial<BracketMatchInput> = {}): BracketMatchInput {
  return {
    id: overrides.id ?? "m1",
    stage: overrides.stage ?? "ROUND_OF_16",
    kickoffAt: overrides.kickoffAt ?? "2026-07-01T18:00:00.000Z"
  };
}

describe("knockoutRoundOrder", () => {
  it("ordonne les tours du plus tot au plus tard", () => {
    expect(knockoutRoundOrder("ROUND_OF_32")).toBeLessThan(knockoutRoundOrder("ROUND_OF_16"));
    expect(knockoutRoundOrder("ROUND_OF_16")).toBeLessThan(knockoutRoundOrder("QUARTER_FINALS"));
    expect(knockoutRoundOrder("QUARTER_FINALS")).toBeLessThan(knockoutRoundOrder("SEMI_FINALS"));
    expect(knockoutRoundOrder("SEMI_FINALS")).toBeLessThan(knockoutRoundOrder("THIRD_PLACE"));
    expect(knockoutRoundOrder("THIRD_PLACE")).toBeLessThan(knockoutRoundOrder("FINAL"));
  });

  it("place la petite finale avant la finale", () => {
    expect(knockoutRoundOrder("THIRD_PLACE")).toBe(5);
    expect(knockoutRoundOrder("FINAL")).toBe(6);
  });
});

describe("buildBracketRounds", () => {
  it("retourne une liste vide sans match", () => {
    expect(buildBracketRounds([])).toEqual([]);
  });

  it("ignore les matchs de poule", () => {
    expect(buildBracketRounds([km({ stage: "GROUP_STAGE" })])).toEqual([]);
  });

  it("regroupe par tour et ordonne 16es -> finale", () => {
    const rounds = buildBracketRounds([
      km({ id: "final", stage: "FINAL" }),
      km({ id: "r16-a", stage: "ROUND_OF_16" }),
      km({ id: "quart", stage: "QUARTER_FINALS" }),
      km({ id: "r16-b", stage: "ROUND_OF_16" }),
      km({ id: "demie", stage: "SEMI_FINALS" })
    ]);
    expect(rounds.map((r) => knockoutRoundOrder(r.stage))).toEqual([2, 3, 4, 6]);
    expect(rounds[0].matches.map((m) => m.id)).toContain("r16-a");
    expect(rounds[0].matches).toHaveLength(2);
  });

  it("trie les matchs d'un tour par coup d'envoi puis id", () => {
    const rounds = buildBracketRounds([
      km({ id: "tard", stage: "QUARTER_FINALS", kickoffAt: "2026-07-05T18:00:00.000Z" }),
      km({ id: "tot", stage: "QUARTER_FINALS", kickoffAt: "2026-07-04T18:00:00.000Z" })
    ]);
    expect(rounds[0].matches.map((m) => m.id)).toEqual(["tot", "tard"]);
  });

  it("respecte l'ordre chronologique meme quand l'id suggere une autre position", () => {
    // Contrat assume : l'ordre dans un tour est purement chronologique (coup
    // d'envoi). On ne connait PAS la filiation des matchs (quel match alimente
    // quel autre), donc un id qui ressemble a une position de tableau ("qf1")
    // ne doit jamais primer sur la chronologie : qf4 joue avant qf1 -> qf4 sort
    // en premier.
    const rounds = buildBracketRounds([
      km({ id: "qf1", stage: "QUARTER_FINALS", kickoffAt: "2026-07-06T18:00:00.000Z" }),
      km({ id: "qf2", stage: "QUARTER_FINALS", kickoffAt: "2026-07-07T18:00:00.000Z" }),
      km({ id: "qf4", stage: "QUARTER_FINALS", kickoffAt: "2026-07-05T18:00:00.000Z" }),
      km({ id: "qf3", stage: "QUARTER_FINALS", kickoffAt: "2026-07-08T18:00:00.000Z" })
    ]);
    expect(rounds[0].matches.map((m) => m.id)).toEqual(["qf4", "qf1", "qf2", "qf3"]);
  });

  it("departage par id uniquement a coup d'envoi identique (ordre stable)", () => {
    const rounds = buildBracketRounds([
      km({ id: "b", stage: "SEMI_FINALS", kickoffAt: "2026-07-09T18:00:00.000Z" }),
      km({ id: "a", stage: "SEMI_FINALS", kickoffAt: "2026-07-09T18:00:00.000Z" })
    ]);
    expect(rounds[0].matches.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
