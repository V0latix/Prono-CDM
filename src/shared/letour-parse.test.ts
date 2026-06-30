import { describe, it, expect } from "vitest";
import iteHtml from "./__fixtures__/letour-ite.html?raw";
import iceHtml from "./__fixtures__/letour-ice.html?raw";
import pageHtml from "./__fixtures__/letour-stage-page.html?raw";
import {
  parseRankingTable,
  parseCombativity,
  extractAjaxRankingPaths
} from "./letour-parse";

describe("parseRankingTable", () => {
  it("parse rang/dossard/coureur/equipe depuis un vrai fragment letour", () => {
    const rows = parseRankingTable(iteHtml);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({
      rank: 1,
      bib: "101",
      rider: "Jasper Philipsen",
      team: "Alpecin Deceuninck",
      nationality: "BEL"
    });
    expect(rows[1].bib).toBe("41");
    expect(rows[1].rider).toBe("Biniam Girmay");
    expect(rows[1].nationality).toBe("ERI");
    expect(rows[2].rank).toBe(3);
    expect(rows[2].bib).toBe("228");
    expect(rows[2].nationality).toBe("NOR");
  });

  it("ignore la ligne d'en-tete (rangs entiers >= 1)", () => {
    const rows = parseRankingTable(iteHtml);
    expect(rows.every((r) => Number.isInteger(r.rank) && r.rank >= 1)).toBe(true);
  });

  it("renvoie [] sans table", () => {
    expect(parseRankingTable("<div>rien</div>")).toEqual([]);
  });
});

describe("parseCombativity", () => {
  it("renvoie le dossard du coureur recompense", () => {
    expect(parseCombativity(iceHtml)).toBe("188");
  });

  it("renvoie null si vide", () => {
    expect(parseCombativity("<table></table>")).toBeNull();
  });
});

describe("extractAjaxRankingPaths", () => {
  it("associe chaque type de classement a son chemin ajax", () => {
    const paths = extractAjaxRankingPaths(pageHtml);
    expect(paths.ite).toBe(
      "/en/ajax/ranking/1/ite/324e15863df723e5844c52e112ee3b79/subtab"
    );
    expect(paths.ice).toContain("/ice/");
    expect(paths.itg ?? paths.ite).toBeDefined();
  });
});
