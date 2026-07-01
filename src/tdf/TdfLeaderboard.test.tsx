import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TdfLeaderboard from "./TdfLeaderboard";
import * as tdfApi from "./api";

const entries = [
  {
    user_id: "u1",
    pseudo: "Alice",
    points: 59,
    stage_points: 19,
    grand_depart_points: 40,
    stages_played: 2,
    best_stage: 12
  },
  {
    user_id: "u2",
    pseudo: "Bob",
    points: 30,
    stage_points: 30,
    grand_depart_points: 0,
    stages_played: 3,
    best_stage: 15
  }
];

describe("TdfLeaderboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("affiche les lignes enrichies (total, détail, étapes jouées) et le maillot jaune au leader", async () => {
    vi.spyOn(tdfApi, "fetchTdfLeaderboard").mockResolvedValue({ leaderboard: entries } as any);
    const { container } = render(<TdfLeaderboard />);

    await waitFor(() => screen.getByText("Alice"));
    // Total + détail des points du leader.
    expect(screen.getByText("59")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();

    // Le leader (1re ligne) porte le maillot jaune.
    const leader = container.querySelector(".tdf-lb-row.leader");
    expect(leader).not.toBeNull();
    expect(leader?.textContent).toContain("🟡");
    expect(leader?.textContent).toContain("Alice");
  });

  it("affiche un état vide invitant à jouer", async () => {
    vi.spyOn(tdfApi, "fetchTdfLeaderboard").mockResolvedValue({ leaderboard: [] } as any);
    render(<TdfLeaderboard />);
    await waitFor(() =>
      expect(screen.getByText(/Personne n'a encore fait de prono/)).toBeInTheDocument()
    );
  });
});
