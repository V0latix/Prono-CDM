import { describe, expect, it } from "vitest";
import { colProfileImage } from "./col-profile";

describe("colProfileImage", () => {
  it("renvoie l'image climbfinder pour un col vérifié (accents/casse ignorés)", () => {
    expect(colProfileImage("Col du Télégraphe")).toBe(
      "https://image.climbfinder.com/col-du-telegraphe.png"
    );
    expect(colProfileImage("Côte de Béguey")).toBe(
      "https://image.climbfinder.com/cote-de-beguey.png"
    );
    // Nom composé letour -> slug vérifié.
    expect(colProfileImage("Puy Mary - Pas de Peyrol")).toBe(
      "https://image.climbfinder.com/pas-de-peyrol.png"
    );
  });

  it("renvoie null pour un col absent de climbfinder (jamais de mauvaise image)", () => {
    expect(colProfileImage("Côte de Cuzy")).toBeNull();
    expect(colProfileImage("Col de Toses")).toBeNull();
  });
});
