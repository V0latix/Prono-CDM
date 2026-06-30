import { describe, expect, it } from "vitest";
import { polkaPoints, greenFinishPoints, GREEN_SPRINT_POINTS } from "./tdf-jersey-points";

describe("polkaPoints (maillot à pois)", () => {
  it("donne le barème par catégorie", () => {
    expect(polkaPoints("HC")).toEqual([20, 15, 12, 10, 8, 6, 4, 2]);
    expect(polkaPoints("1")).toEqual([10, 8, 6, 4, 2, 1]);
    expect(polkaPoints("2")).toEqual([5, 3, 2, 1]);
    expect(polkaPoints("3")).toEqual([2, 1]);
    expect(polkaPoints("4")).toEqual([1]);
  });

  it("double les points à l'arrivée au sommet pour HC et 1re cat", () => {
    expect(polkaPoints("HC", true)).toEqual([40, 30, 24, 20, 16, 12, 8, 4]);
    expect(polkaPoints("1", true)).toEqual([20, 16, 12, 8, 4, 2]);
    // Pas de doublement pour les catégories inférieures.
    expect(polkaPoints("2", true)).toEqual([5, 3, 2, 1]);
  });

  it("renvoie un tableau vide pour une catégorie inconnue", () => {
    expect(polkaPoints("x")).toEqual([]);
  });
});

describe("greenFinishPoints (maillot vert, arrivée)", () => {
  it("varie selon le type d'étape", () => {
    expect(greenFinishPoints("flat")[0]).toBe(50);
    expect(greenFinishPoints("hilly")[0]).toBe(30);
    expect(greenFinishPoints("mountain")[0]).toBe(20);
  });

  it("retombe sur le barème plat pour un type inconnu", () => {
    expect(greenFinishPoints("")[0]).toBe(50);
  });
});

describe("GREEN_SPRINT_POINTS (sprint intermédiaire)", () => {
  it("commence à 20 et compte 14 places", () => {
    expect(GREEN_SPRINT_POINTS[0]).toBe(20);
    expect(GREEN_SPRINT_POINTS).toHaveLength(14);
  });
});
