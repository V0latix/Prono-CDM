import { describe, expect, it } from "vitest";
import { VENUE_OVERRIDES, resolveVenue } from "./venues";

describe("resolveVenue", () => {
  it("retourne le stade cure quand l'API ne fournit rien", () => {
    // 537391 = France - Senegal (CDM 2026) au MetLife Stadium.
    expect(resolveVenue("537391", null)).toBe("MetLife Stadium");
    expect(resolveVenue("537327", "")).toBe("Estadio Azteca");
  });

  it("prefere la valeur de l'API si elle existe un jour", () => {
    expect(resolveVenue("537391", "Stade officiel")).toBe("Stade officiel");
  });

  it("retourne null pour un match sans stade connu", () => {
    expect(resolveVenue("inconnu", null)).toBeNull();
  });

  it("a une grille de stades non vide et coherente (16 stades CDM 2026)", () => {
    const stades = new Set(Object.values(VENUE_OVERRIDES));
    expect(Object.keys(VENUE_OVERRIDES).length).toBe(72);
    expect(stades.size).toBe(16);
    for (const stade of stades) {
      expect(stade.trim().length).toBeGreaterThan(0);
    }
  });
});
