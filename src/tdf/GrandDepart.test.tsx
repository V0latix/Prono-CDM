import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GrandDepart from "./GrandDepart";
import * as tdfApi from "./api";
import type { TdfRider } from "./api";

const riders = [
  { id: "r1", name: "Un", team: "A", nationality: "FRA", is_young: 0, status: "active" },
  { id: "r2", name: "Deux", team: "B", nationality: "BEL", is_young: 0, status: "active" },
  { id: "r3", name: "Trois", team: "C", nationality: "ESP", is_young: 0, status: "active" }
] as TdfRider[];

describe("GrandDepart", () => {
  afterEach(() => vi.restoreAllMocks());

  it("n'autorise la validation qu'une fois podiums + maillots complets, puis enregistre", async () => {
    const save = vi.spyOn(tdfApi, "saveTdfGrandDepart").mockResolvedValue({ ok: true } as any);
    render(<GrandDepart riders={riders} />);

    const submit = screen.getByRole("button", { name: /valider/i });
    expect(submit).toBeDisabled();

    const pick = (label: RegExp | string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    pick("Jaune position 1", "r1");
    pick("Jaune position 2", "r2");
    pick("Jaune position 3", "r3");
    pick("Blanc position 1", "r1");
    pick("Blanc position 2", "r2");
    pick("Blanc position 3", "r3");
    pick("Maillot vert", "r1");
    pick("Maillot à pois", "r2");

    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        yellow: ["r1", "r2", "r3"],
        white: ["r1", "r2", "r3"],
        green: "r1",
        polka: "r2"
      })
    );
    expect(screen.getByText("Pronos enregistrés.")).toBeInTheDocument();
  });

  it("verrouille la saisie quand le grand départ est fermé", () => {
    render(<GrandDepart riders={riders} locked />);
    expect(screen.getByText(/verrouillés/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /valider/i })).toBeNull();
  });
});
