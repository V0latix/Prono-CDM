import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StageRouteSection, { defaultIndex } from "./StageRouteSection";
import * as tdfApi from "./api";

function stage(no: number, date: string, extra: Partial<any> = {}) {
  return {
    stage_no: no,
    date,
    lock_at: "",
    type: "flat",
    label: `S${no}`,
    status: "upcoming",
    combative_rider_id: null,
    profile_image_url: `https://img/${no}`,
    cols: [],
    ...extra
  };
}

describe("defaultIndex", () => {
  it("choisit la première étape dont la date n'est pas passée", () => {
    const s = [stage(1, "2026-07-04"), stage(2, "2026-07-20"), stage(3, "2026-07-21")];
    expect(defaultIndex(s as any, "2026-07-20")).toBe(1);
    expect(defaultIndex(s as any, "2026-07-01")).toBe(0);
  });

  it("retombe sur la dernière étape si tout est passé", () => {
    const s = [stage(1, "2026-07-04"), stage(2, "2026-07-05")];
    expect(defaultIndex(s as any, "2026-08-01")).toBe(1);
  });
});

describe("StageRouteSection (pager)", () => {
  afterEach(() => vi.restoreAllMocks());

  // Dates lointaines : le défaut est toujours l'étape 1, quel que soit "aujourd'hui".
  const stages = [
    stage(1, "2099-01-01"),
    stage(2, "2099-01-02", { type: "mountain", cols: [{ kind: "col", name: "Col X", category: "1", km: 100 }] }),
    stage(3, "2099-01-03")
  ];

  it("affiche la première étape et navigue avec les flèches (bornées)", async () => {
    vi.spyOn(tdfApi, "fetchTdfStages").mockResolvedValue({ stages } as any);
    render(<StageRouteSection />);

    await waitFor(() => screen.getByText("Étape 1 — S1"));
    expect(screen.getByLabelText("Étape précédente")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Étape suivante"));
    expect(screen.getByText("Étape 2 — S2")).toBeInTheDocument();
    // Le col catégorisé et ses points pois s'affichent.
    expect(screen.getByText("Col X")).toBeInTheDocument();
    expect(screen.getByText("10 · 8 · 6 · 4 · 2 · 1")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Étape suivante"));
    expect(screen.getByText("Étape 3 — S3")).toBeInTheDocument();
    expect(screen.getByLabelText("Étape suivante")).toBeDisabled();
  });
});
