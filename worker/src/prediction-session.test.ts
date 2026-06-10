import { describe, expect, it } from "vitest";
import { SESSION_GAP_HOURS, selectPredictionSession } from "./prediction-session";

const m = (id: string, kickoff_at: string) => ({ id, kickoff_at });

describe("selectPredictionSession", () => {
  it("retourne une liste vide quand il n'y a aucun match", () => {
    expect(selectPredictionSession([])).toEqual([]);
  });

  it("garde un seul match isolé", () => {
    const matches = [m("a", "2026-06-18T18:00:00.000Z")];
    expect(selectPredictionSession(matches)).toEqual(matches);
  });

  it("inclut les matchs de nuit qui franchissent minuit", () => {
    // Soirée + nuit : 18h, 21h, 00h (J+1 UTC), 03h (J+1 UTC). Tout le lot doit
    // rester ensemble même si les deux derniers tombent le jour suivant.
    const matches = [
      m("soir1", "2026-06-18T18:00:00.000Z"),
      m("soir2", "2026-06-18T21:00:00.000Z"),
      m("nuit1", "2026-06-19T00:00:00.000Z"),
      m("nuit2", "2026-06-19T03:00:00.000Z")
    ];
    expect(selectPredictionSession(matches).map((x) => x.id)).toEqual([
      "soir1",
      "soir2",
      "nuit1",
      "nuit2"
    ]);
  });

  it("s'arrête avant les matchs du lendemain (trou horaire large)", () => {
    const matches = [
      m("soir1", "2026-06-18T18:00:00.000Z"),
      m("nuit1", "2026-06-19T02:00:00.000Z"),
      // ~16h plus tard : nouvelle session
      m("lendemain1", "2026-06-19T18:00:00.000Z"),
      m("lendemain2", "2026-06-19T21:00:00.000Z")
    ];
    expect(selectPredictionSession(matches).map((x) => x.id)).toEqual([
      "soir1",
      "nuit1"
    ]);
  });

  it("coupe pile au seuil de gap", () => {
    const matches = [
      m("a", "2026-06-18T18:00:00.000Z"),
      // exactement SESSION_GAP_HOURS plus tard => exclu
      m("b", `2026-06-19T03:00:00.000Z`)
    ];
    expect(selectPredictionSession(matches, SESSION_GAP_HOURS).map((x) => x.id)).toEqual(["a"]);
  });

  it("respecte un seuil de gap personnalisé", () => {
    const matches = [
      m("a", "2026-06-18T18:00:00.000Z"),
      m("b", "2026-06-18T20:00:00.000Z")
    ];
    expect(selectPredictionSession(matches, 1).map((x) => x.id)).toEqual(["a"]);
    expect(selectPredictionSession(matches, 3).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
