import { describe, expect, it } from "vitest";
import { currentWeekRange } from "./week";

// Reconstruit le lundi 00h local attendu pour une date donnée, au format ISO.
function expectedMonday(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toISOString();
}

describe("currentWeekRange", () => {
  it("retourne lundi -> lundi suivant pour un mardi", () => {
    // 2026-06-16 est un mardi.
    const range = currentWeekRange(new Date(2026, 5, 16, 14, 30));
    expect(range.from).toBe(expectedMonday(2026, 5, 15));
    expect(range.to).toBe(expectedMonday(2026, 5, 22));
  });

  it("inclut le dimanche dans la semaine en cours", () => {
    // 2026-06-21 est un dimanche : il appartient à la semaine du lundi 15.
    const range = currentWeekRange(new Date(2026, 5, 21, 23, 59));
    expect(range.from).toBe(expectedMonday(2026, 5, 15));
    expect(range.to).toBe(expectedMonday(2026, 5, 22));
  });

  it("démarre la semaine le lundi même à minuit", () => {
    // 2026-06-15 est un lundi.
    const range = currentWeekRange(new Date(2026, 5, 15, 0, 0));
    expect(range.from).toBe(expectedMonday(2026, 5, 15));
    expect(range.to).toBe(expectedMonday(2026, 5, 22));
  });

  it("produit une fenêtre de 7 jours", () => {
    const range = currentWeekRange(new Date(2026, 5, 18, 9, 0));
    const spanMs = Date.parse(range.to) - Date.parse(range.from);
    expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
