import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StageProfile from "./StageProfile";
import {
  greenFinishPoints,
  GREEN_SPRINT_POINTS,
  polkaPoints
} from "../shared/tdf-jersey-points";

function stage(extra: Record<string, unknown> = {}) {
  return {
    stage_no: 3,
    date: "2026-07-06",
    lock_at: "",
    type: "flat",
    label: "A → B",
    status: "upcoming",
    combative_rider_id: null,
    profile_image_url: "https://img/3",
    cols: [{ kind: "col", name: "Col Test", category: "1", km: 100 }],
    ...extra
  };
}

describe("StageProfile", () => {
  it("affiche le profil, les barèmes vert et les cols avec leurs points pois", () => {
    render(<StageProfile stage={stage() as any} />);
    expect(screen.getByAltText("Profil de l'étape 3")).toBeInTheDocument();
    // Barème vert : arrivée (type plat) + sprint intermédiaire.
    expect(screen.getByText(greenFinishPoints("flat").join(" · "))).toBeInTheDocument();
    expect(screen.getByText(GREEN_SPRINT_POINTS.join(" · "))).toBeInTheDocument();
    // Col catégorisé + points pois de sa catégorie.
    expect(screen.getByText("Col Test")).toBeInTheDocument();
    expect(screen.getByText(polkaPoints("1").join(" · "))).toBeInTheDocument();
  });

  it("masque la ligne type·date quand showMeta est false", () => {
    const { container, rerender } = render(<StageProfile stage={stage() as any} showMeta />);
    expect(container.querySelector(".tdf-route-meta")).not.toBeNull();
    rerender(<StageProfile stage={stage() as any} showMeta={false} />);
    expect(container.querySelector(".tdf-route-meta")).toBeNull();
  });

  it("affiche un repli quand le profil et les cols sont absents", () => {
    render(<StageProfile stage={stage({ profile_image_url: null, cols: [] }) as any} />);
    expect(screen.getByText("Profil indisponible pour le moment.")).toBeInTheDocument();
    expect(screen.getByText("Aucun col catégorisé sur cette étape.")).toBeInTheDocument();
  });
});
