import { describe, expect, it } from "vitest";
import { scoreStage, scoreGrandDepart } from "./tdf-scoring";

const result = [
  { rank: 1, riderId: "a" },
  { rank: 2, riderId: "b" },
  { rank: 3, riderId: "c" },
  { rank: 4, riderId: "d" },
  { rank: 5, riderId: "e" },
  { rank: 6, riderId: "f" },
  { rank: 7, riderId: "g" },
  { rank: 8, riderId: "h" },
  { rank: 9, riderId: "i" },
  { rank: 10, riderId: "j" }
];

describe("scoreStage", () => {
  it("rapporte l'inverse de la place réelle (10e = 10 pts, 1er = 1 pt)", () => {
    // pick "j" (10e -> 10) et "a" (1er -> 1) = 11
    expect(scoreStage(["j", "a"], null, result, null)).toBe(11);
  });

  it("ignore les coureurs hors top 10", () => {
    expect(scoreStage(["zzz"], null, result, null)).toBe(0);
  });

  it("ajoute +10 si le combatif est juste", () => {
    expect(scoreStage([], "x", result, "x")).toBe(10);
  });

  it("ne donne pas le bonus combatif si faux", () => {
    expect(scoreStage([], "x", result, "y")).toBe(0);
  });

  it("max théorique = 65 (les 10 + combatif)", () => {
    expect(
      scoreStage(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], "k", result, "k")
    ).toBe(55 + 10);
  });
});

const results = {
  yellow: ["a", "b", "c"] as [string, string, string],
  white: ["w1", "w2", "w3"] as [string, string, string],
  green: "g",
  polka: "p"
};

describe("scoreGrandDepart", () => {
  it("podium jaune place exacte = 80/40/20", () => {
    const pred = { yellow: ["a", "b", "c"], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(140);
  });

  it("Pogacar pronostiqué 1er finit 2e = moitié de la 2e place = 20", () => {
    // "b" finit 2e ; pronostiqué en 1re position -> mauvaise place -> moitié(2e)=20
    const pred = { yellow: ["b", null, null], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(20);
  });

  it("Seixas pronostiqué 3e finit 1er = moitié de la 1re place = 40", () => {
    // "a" finit 1er ; pronostiqué en 3e position -> mauvaise place -> moitié(1er)=40
    const pred = { yellow: [null, null, "a"], white: [null, null, null], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(40);
  });

  it("podium blanc place exacte = 40/20/10", () => {
    const pred = { yellow: [null, null, null], white: ["w1", "w2", "w3"], green: null, polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(70);
  });

  it("vert et pois justes = +40 chacun", () => {
    const pred = { yellow: [null, null, null], white: [null, null, null], green: "g", polka: "p" };
    expect(scoreGrandDepart(pred as any, results)).toBe(80);
  });

  it("vert faux = 0", () => {
    const pred = { yellow: [null, null, null], white: [null, null, null], green: "x", polka: null };
    expect(scoreGrandDepart(pred as any, results)).toBe(0);
  });
});
