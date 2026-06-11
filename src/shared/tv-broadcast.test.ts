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

  it("applique une surcharge clair (TF1 + beIN) pour un match liste", () => {
    BROADCAST_OVERRIDES["tf1-match"] = ["TF1", "BEIN"];
    try {
      expect(resolveBroadcasters("tf1-match").map((c) => c.key)).toEqual(["TF1", "BEIN"]);
    } finally {
      delete BROADCAST_OVERRIDES["tf1-match"];
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

  it("ne duplique pas une chaine listee deux fois", () => {
    BROADCAST_OVERRIDES["dup"] = ["BEIN", "BEIN", "M6"];
    try {
      expect(resolveBroadcasters("dup").map((c) => c.key)).toEqual(["BEIN", "M6"]);
    } finally {
      delete BROADCAST_OVERRIDES["dup"];
    }
  });
});
