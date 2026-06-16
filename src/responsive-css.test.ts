import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest runs this test in Node; the app tsconfig does not include Node types.
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8");

function mediaBlock(maxWidth: number): string {
  const marker = `@media (max-width: ${maxWidth}px)`;
  const start = css.indexOf(marker);
  if (start === -1) return "";
  const nextMedia = css.indexOf("@media", start + marker.length);
  return css.slice(start, nextMedia === -1 ? undefined : nextMedia);
}

describe("responsive CSS", () => {
  it("keeps the mobile primary navigation fixed and icon-only", () => {
    const mobile = mediaBlock(640);

    expect(mobile).toContain(".nav-list");
    expect(mobile).toContain("position: fixed");
    expect(mobile).toContain("bottom: max(0.75rem, env(safe-area-inset-bottom))");
    expect(mobile).toContain(".nav-list button span");
    expect(mobile).toContain("display: none");
  });

  it("does not collapse dashboard and stats grids too early on tablet", () => {
    const tablet = mediaBlock(980);

    expect(tablet).not.toContain(".summary-strip,");
    expect(tablet).not.toContain(".sync-grid,");
    expect(tablet).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("defines dark theme variables for global surfaces", () => {
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("--panel: #151a20");
    expect(css).toContain("--on-accent: #07101f");
    expect(css).toContain("background: var(--panel)");
  });

  it("uses a more readable sans-serif font on high contrast color themes", () => {
    expect(css).toContain('html[data-theme="grass"]');
    expect(css).toContain('html[data-theme="france"]');
    expect(css).toContain('--font-display: "Inter", sans-serif');
    expect(css).toContain('--font-body: "Inter", sans-serif');
  });

  it("does not force uppercase on every paragraph inside the topbar", () => {
    // Le libellé .eyebrow reste en capitales, mais la règle ne doit pas viser
    // tous les .topbar p : sinon les descriptions du panneau Nouveautés (rendu
    // dans le topbar) repassent en majuscules et deviennent illisibles.
    expect(css).not.toMatch(/\.topbar p\s*,/);
    expect(css).toMatch(/\.eyebrow\s*\{[^}]*text-transform:\s*uppercase/);
  });

  it("animates the news surfaces but respects reduced motion", () => {
    expect(css).toContain("@keyframes news-pop");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".news-modal");
    expect(reduced).toContain("animation: none");
  });

  it("lets the group standings table scroll horizontally on mobile instead of clipping columns", () => {
    // .standings-group est un item de grille : sans min-width:0 il refuse de
    // retrecir sous la largeur de sa table et se fait rogner par
    // l'overflow:hidden de .content-section (colonnes Diff/Pts coupees, sans
    // scroll). Cf. bug d'affichage mobile de l'onglet Resultats > Poules.
    expect(css).toMatch(/\.standings-group\s*\{[^}]*min-width:\s*0/);

    // Sur mobile la table repasse en largeur naturelle : sinon les colonnes de
    // stats a largeur fixe ecrasent la colonne equipe (noms chevauchant les
    // chiffres).
    const mobile = mediaBlock(640);
    expect(mobile).toMatch(/\.standings-table\s*\{[^}]*table-layout:\s*auto/);
  });

  it("puts profile editing before badges on mobile", () => {
    const mobile = mediaBlock(640);

    expect(mobile).toContain(".profile-edit-section");
    expect(mobile).toContain("order: 2");
    expect(mobile).toContain(".profile-badges-section");
    expect(mobile).toContain("order: 3");
  });
});
