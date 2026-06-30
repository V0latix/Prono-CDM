import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TdfApp from "./TdfApp";
import * as tdfApi from "./api";

const user = { id: "u1", pseudo: "Bob", isAdmin: false } as any;

describe("TdfApp (contenu seul)", () => {
  it("rend le contenu de la vue passée en prop", () => {
    render(<TdfApp user={user} view="rules" onNavigate={() => {}} />);
    expect(screen.getByText("Comment marquer des points")).toBeInTheDocument();
  });

  it("appelle onNavigate quand le dashboard ouvre les pronos", async () => {
    vi.spyOn(tdfApi, "fetchTdfDashboard").mockResolvedValue({
      nextStage: {
        stage_no: 1,
        date: "2026-07-04",
        lock_at: "2999-01-01T00:00:00Z",
        type: "flat",
        label: "A → B",
        status: "upcoming",
        combative_rider_id: null
      },
      myPrediction: null
    } as any);
    const onNavigate = vi.fn();
    render(<TdfApp user={user} view="dashboard" onNavigate={onNavigate} />);

    const btn = await waitFor(() => screen.getByRole("button", { name: /poser mon prono/i }));
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith("predictions");
  });
});
