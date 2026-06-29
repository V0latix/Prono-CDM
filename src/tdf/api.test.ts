import { describe, expect, it, vi, beforeEach } from "vitest";
import * as apiModule from "../api";
import { saveTdfStagePrediction, fetchTdfRiders } from "./api";

describe("tdf api client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("PUT le prono d'étape sur la bonne route", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ ok: true } as any);
    await saveTdfStagePrediction(3, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], "a");
    expect(spy).toHaveBeenCalledWith(
      "/api/tdf/predictions/3",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("GET le peloton", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ riders: [] } as any);
    await fetchTdfRiders();
    expect(spy).toHaveBeenCalledWith("/api/tdf/riders");
  });
});
