import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TdfAdmin from "./TdfAdmin";
import * as apiModule from "../api";

describe("TdfAdmin", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("POST le résultat d'étape (top 10 + combatif)", async () => {
    const spy = vi.spyOn(apiModule, "api").mockResolvedValue({ ok: true } as any);
    render(<TdfAdmin />);
    fireEvent.change(screen.getByLabelText(/étape/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/1er/i), { target: { value: "tadej-pogacar" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        "/api/admin/tdf/stage-result",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("affiche la confirmation après soumission", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValue({ ok: true } as any);
    render(<TdfAdmin />);
    fireEvent.change(screen.getByLabelText(/étape/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(screen.getByText(/enregistré/i)).toBeTruthy()
    );
  });
});
