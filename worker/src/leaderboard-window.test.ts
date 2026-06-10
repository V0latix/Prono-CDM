import { describe, expect, it } from "vitest";
import { parseDateWindow } from "./leaderboard-window";

describe("parseDateWindow", () => {
  it("retourne null quand aucune borne n'est fournie", () => {
    expect(parseDateWindow(null, null)).toBeNull();
    expect(parseDateWindow(undefined, undefined)).toBeNull();
  });

  it("normalise une fenêtre ISO canonique sans la modifier", () => {
    expect(
      parseDateWindow("2026-06-15T00:00:00.000Z", "2026-06-22T00:00:00.000Z")
    ).toEqual({ from: "2026-06-15T00:00:00.000Z", to: "2026-06-22T00:00:00.000Z" });
  });

  it("normalise une date seule en ISO UTC canonique", () => {
    const window = parseDateWindow("2026-06-15", "2026-06-22");
    expect(window).toEqual({
      from: "2026-06-15T00:00:00.000Z",
      to: "2026-06-22T00:00:00.000Z"
    });
  });

  it("normalise une entrée avec décalage horaire vers UTC", () => {
    // 02:00+02:00 == 00:00Z : doit produire une borne canonique comparable
    // lexicographiquement aux kickoff_at stockés.
    const window = parseDateWindow("2026-06-15T02:00:00+02:00", "2026-06-22T02:00:00+02:00");
    expect(window).toEqual({
      from: "2026-06-15T00:00:00.000Z",
      to: "2026-06-22T00:00:00.000Z"
    });
  });

  it("rejette une fenêtre partielle", () => {
    expect(() => parseDateWindow("2026-06-15", null)).toThrow();
    expect(() => parseDateWindow(null, "2026-06-22")).toThrow();
  });

  it("rejette une fenêtre inversée ou vide", () => {
    expect(() => parseDateWindow("2026-06-22", "2026-06-15")).toThrow();
    expect(() =>
      parseDateWindow("2026-06-15T00:00:00.000Z", "2026-06-15T00:00:00.000Z")
    ).toThrow();
  });

  it("rejette une date non parseable", () => {
    expect(() => parseDateWindow("pas-une-date", "2026-06-22")).toThrow();
  });
});
