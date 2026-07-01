import { describe, expect, it } from "vitest";
import { colProfileUrl } from "./col-profile";

describe("colProfileUrl", () => {
  it("lie directement les cols au slug climbfinder vérifié (accents/casse ignorés)", () => {
    expect(colProfileUrl("Col du Télégraphe")).toBe(
      "https://climbfinder.com/en/climbs/col-du-telegraphe"
    );
    expect(colProfileUrl("Côte de la Butte Montmartre")).toBe(
      "https://climbfinder.com/en/climbs/cote-de-la-butte-montmartre"
    );
  });

  it("retombe sur une recherche climbfinder pour un col inconnu", () => {
    const url = colProfileUrl("Côte de Cuzy");
    expect(url).toContain("google.com/search");
    expect(url).toContain(encodeURIComponent("climbfinder Côte de Cuzy"));
  });
});
