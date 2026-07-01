import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TdfResults from "./TdfResults";
import * as tdfApi from "./api";

const riders = {
  riders: [
    { id: "101", name: "Alice", team: "Team A", nationality: "FRA", is_young: 0, status: "active" },
    { id: "41", name: "Bob", team: "Team B", nationality: "BEL", is_young: 1, status: "active" }
  ]
};

function mockResults(over: Record<string, unknown> = {}) {
  return {
    stages: [
      {
        stage_no: 1,
        label: "Paris → Roubaix",
        date: "2026-07-04",
        lock_at: "",
        type: "flat",
        status: "finished",
        combative_rider_id: "101"
      }
    ],
    results: [
      { stage_no: 1, rider_id: "101", rank: 1 },
      { stage_no: 1, rider_id: "41", rank: 2 }
    ],
    classifications: {
      yellow: [{ rank: 1, rider_id: "101" }],
      green: [{ rank: 1, rider_id: "41" }],
      polka: [{ rank: 1, rider_id: "101" }],
      white: [{ rank: 1, rider_id: "41" }]
    },
    ...over
  };
}

describe("TdfResults", () => {
  afterEach(() => vi.restoreAllMocks());

  it("affiche les classements généraux (4 maillots, ordre) et les résultats par étape", async () => {
    vi.spyOn(tdfApi, "fetchTdfResults").mockResolvedValue(mockResults() as any);
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue(riders as any);
    const { container } = render(<TdfResults />);

    await waitFor(() => screen.getByText("Classements généraux"));
    const titles = Array.from(container.querySelectorAll(".tdf-jersey-title")).map(
      (t) => t.textContent
    );
    expect(titles).toHaveLength(4);
    expect(titles[0]).toContain("Maillot jaune");
    expect(titles[1]).toContain("Maillot vert");
    expect(titles[2]).toContain("Maillot à pois");
    expect(titles[3]).toContain("Maillot blanc");

    // Résultats par étape : top 10 + combatif (noms résolus via le peloton).
    expect(screen.getByText("Résultats par étape")).toBeInTheDocument();
    expect(screen.getByText("Étape 1 — Paris → Roubaix")).toBeInTheDocument();
    expect(screen.getByText(/Combatif/)).toBeInTheDocument();
  });

  it("affiche les classements même sans étape terminée", async () => {
    vi.spyOn(tdfApi, "fetchTdfResults").mockResolvedValue(
      mockResults({ stages: [], results: [] }) as any
    );
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue(riders as any);
    render(<TdfResults />);

    await waitFor(() => screen.getByText("Classements généraux"));
    expect(screen.queryByText(/Aucune étape terminée/)).toBeNull();
    expect(screen.queryByText("Résultats par étape")).toBeNull();
  });

  it("affiche l'état vide sans étape ni classement", async () => {
    vi.spyOn(tdfApi, "fetchTdfResults").mockResolvedValue(
      mockResults({ stages: [], results: [], classifications: {} }) as any
    );
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue(riders as any);
    render(<TdfResults />);

    await waitFor(() =>
      expect(screen.getByText(/Aucune étape terminée/)).toBeInTheDocument()
    );
  });
});
