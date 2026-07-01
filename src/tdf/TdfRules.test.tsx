import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import TdfRules from "./TdfRules";

// Garde de cohérence : le règlement affiché doit refléter le barème du code
// (src/shared/tdf-scoring.ts + tdf-jersey-points.ts). Cf. CLAUDE.md.
describe("TdfRules", () => {
  it("affiche le barème étape et grand départ conforme au scoring", () => {
    const { container } = render(<TdfRules />);
    const text = (container.textContent ?? "").replace(/\s+/g, " ");

    // Étape : 1er = 10 pts (11 − place) + combatif +10.
    expect(text).toContain("1er = 10 pts");
    expect(text).toContain("Combatif correct : +10 pts");

    // Grand départ — maillot jaune (place exacte 80/40/20, moitié 40/20/10).
    expect(text).toContain("1er = 80 pts");
    expect(text).toContain("40 / 20 / 10 pts");

    // Maillot blanc (40/20/10, moitié 20/10/5) + vert/pois +40.
    expect(text).toContain("1er = 40 pts");
    expect(text).toContain("20 / 10 / 5 pts");
    expect(text).toContain("Maillot vert correct : +40 pts");
    expect(text).toContain("Maillot à pois correct : +40 pts");
  });
});
