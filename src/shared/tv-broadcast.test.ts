import { describe, expect, it } from "vitest";
import { BROADCAST_OVERRIDES, resolveBroadcasters } from "./tv-broadcast";

describe("resolveBroadcasters", () => {
  it("met tous les matchs sur beIN SPORTS par defaut (clair non devine)", () => {
    expect(resolveBroadcasters("1").map((c) => c.key)).toEqual(["BEIN"]);
    expect(resolveBroadcasters("inconnu").map((c) => c.key)).toEqual(["BEIN"]);
  });

  it("applique une surcharge clair (M6 + beIN) pour un match liste", () => {
    BROADCAST_OVERRIDES["m6-match"] = ["M6", "BEIN"];
    try {
      expect(resolveBroadcasters("m6-match").map((c) => c.key)).toEqual(["M6", "BEIN"]);
    } finally {
      delete BROADCAST_OVERRIDES["m6-match"];
    }
  });

  it("ignore les cles inconnues d'une surcharge et retombe sur beIN", () => {
    BROADCAST_OVERRIDES["bad"] = ["INCONNU"];
    try {
      expect(resolveBroadcasters("bad").map((c) => c.key)).toEqual(["BEIN"]);
    } finally {
      delete BROADCAST_OVERRIDES["bad"];
    }
  });

  it("resout les matchs M6 reels de la grille (France - Senegal sur M6 + beIN)", () => {
    // 537391 = France - Senegal (CDM 2026), diffuse en clair sur M6.
    expect(resolveBroadcasters("537391").map((c) => c.key)).toEqual(["M6", "BEIN"]);
  });

  it("a une grille M6 non vide et coherente (toujours beIN inclus)", () => {
    const entries = Object.entries(BROADCAST_OVERRIDES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, keys] of entries) {
      expect(keys, `override ${id} doit inclure BEIN`).toContain("BEIN");
      // Les cles listees sont toutes resolues (pas de chaine inconnue).
      expect(resolveBroadcasters(id).length, `override ${id} doit resoudre au moins une chaine`).toBeGreaterThan(0);
    }
  });

  it("ne duplique pas une chaine listee deux fois", () => {
    BROADCAST_OVERRIDES["dup"] = ["BEIN", "BEIN", "M6"];
    try {
      expect(resolveBroadcasters("dup").map((c) => c.key)).toEqual(["BEIN", "M6"]);
    } finally {
      delete BROADCAST_OVERRIDES["dup"];
    }
  });
});
