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

  it("puts profile editing before badges on mobile", () => {
    const mobile = mediaBlock(640);

    expect(mobile).toContain(".profile-edit-section");
    expect(mobile).toContain("order: 2");
    expect(mobile).toContain(".profile-badges-section");
    expect(mobile).toContain("order: 3");
  });
});
