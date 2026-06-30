import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StagePrediction from "./StagePrediction";
import * as tdfApi from "./api";

const riders = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  name: `Rider ${i}`,
  team: "T",
  nationality: "FR",
  is_young: 0,
  status: "active"
}));

describe("StagePrediction", () => {
  it("empêche de valider tant que 10 coureurs ne sont pas choisis", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders } as any);
    const stage = {
      stage_no: 1,
      date: "2026-07-04",
      lock_at: "2999-01-01T00:00:00Z",
      type: "flat",
      label: "A → B",
      status: "upcoming",
      combative_rider_id: null
    };
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Rider 0"));
    const submit = screen.getByRole("button", { name: /valider/i });
    expect(submit).toBeDisabled();
  });

  it("envoie le prono une fois 10 coureurs choisis", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders } as any);
    const save = vi
      .spyOn(tdfApi, "saveTdfStagePrediction")
      .mockResolvedValue({ ok: true } as any);
    const stage = {
      stage_no: 1,
      date: "2026-07-04",
      lock_at: "2999-01-01T00:00:00Z",
      type: "flat",
      label: "A → B",
      status: "upcoming",
      combative_rider_id: null
    };
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Rider 0"));

    // Sélectionner exactement 10 coureurs
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: `Rider ${i}` }));
    }

    // Le bouton doit maintenant être activé
    const submit = screen.getByRole("button", { name: /valider/i });
    expect(submit).not.toBeDisabled();

    // Choisir un combatif puis valider
    fireEvent.click(screen.getByRole("button", { name: /combatif Rider 0/i }));
    fireEvent.click(submit);

    await waitFor(() => expect(save).toHaveBeenCalledWith(1, expect.any(Array), "r0"));
  });

  it("bloque la sélection une fois 10 coureurs atteints", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders } as any);
    const stage = {
      stage_no: 1,
      date: "2026-07-04",
      lock_at: "2999-01-01T00:00:00Z",
      type: "flat",
      label: "A → B",
      status: "upcoming",
      combative_rider_id: null
    };
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Rider 0"));

    // Sélectionner 10 coureurs
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: `Rider ${i}` }));
    }

    // Le 11ème clic ne doit pas ajouter le coureur
    const submit = screen.getByRole("button", { name: /valider/i });
    expect(submit).not.toBeDisabled();

    // Cliquer sur le 11ème coureur ne change pas l'état du bouton Valider
    fireEvent.click(screen.getByRole("button", { name: "Rider 10" }));
    expect(submit).not.toBeDisabled();
  });

  const stage = {
    stage_no: 1,
    date: "2026-07-04",
    lock_at: "2999-01-01T00:00:00Z",
    type: "flat",
    label: "A → B",
    status: "upcoming",
    combative_rider_id: null
  };

  const mixed = [
    { id: "a", name: "Alpha", team: "Red", nationality: "FRA", is_young: 0, status: "active" },
    { id: "b", name: "Bravo", team: "Blue", nationality: "BEL", is_young: 0, status: "active" },
    { id: "c", name: "Charlie", team: "Red", nationality: "BEL", is_young: 0, status: "active" }
  ];

  it("filtre la liste avec la recherche par nom", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders: mixed } as any);
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Alpha"));

    fireEvent.change(screen.getByLabelText(/rechercher un coureur/i), {
      target: { value: "brav" }
    });
    expect(screen.getByRole("button", { name: "Bravo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Charlie" })).toBeNull();
  });

  it("filtre par nationalité", async () => {
    vi.spyOn(tdfApi, "fetchTdfRiders").mockResolvedValue({ riders: mixed } as any);
    render(<StagePrediction stage={stage as any} />);
    await waitFor(() => screen.getByText("Alpha"));

    fireEvent.change(screen.getByLabelText(/filtrer par nationalité/i), {
      target: { value: "BEL" }
    });
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Bravo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charlie" })).toBeInTheDocument();
  });
});
