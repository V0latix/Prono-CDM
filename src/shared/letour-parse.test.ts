import { describe, it, expect } from "vitest";
import iteHtml from "./__fixtures__/letour-ite.html?raw";
import iceHtml from "./__fixtures__/letour-ice.html?raw";
import pageHtml from "./__fixtures__/letour-stage-page.html?raw";
import stageDetailHtml from "./__fixtures__/letour-stage-detail.html?raw";
import {
  parseRankingTable,
  parseCombativity,
  extractAjaxRankingPaths,
  parseStageDetail
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

describe("parseStageDetail", () => {
  const detail = parseStageDetail(stageDetailHtml);

  it("extrait l'en-tête : route, type, date", () => {
    expect(detail.label).toBe("Voiron → Orcières-Merlette");
    expect(detail.type).toBe("mountain");
    expect(detail.date).toBe("2026-07-23");
  });

  it("récupère l'URL de l'image de profil ASO", () => {
    expect(detail.profileImageUrl).toContain("img.aso.fr");
    expect(detail.profileImageUrl).toContain("tdf26-profils");
  });

  it("ne garde que les cols catégorisés, avec catégorie/nom/km", () => {
    expect(detail.cols).toEqual([
      { category: "1", name: "Côte d'Engins", km: 148.5 },
      { category: "2", name: "Côte de Monteynard", km: 92.3 },
      { category: "3", name: "Côte de Saint-Léger-les-Mélèzes", km: 21 }
    ]);
    // Le départ (r), l'arrivée (a) et les villes (n) ne sont pas des cols.
    expect(detail.cols.some((c) => /CORPS|Voiron|Orcières/.test(c.name))).toBe(false);
  });

  it("renvoie des valeurs vides sur un HTML sans parcours", () => {
    const empty = parseStageDetail("<html></html>");
    expect(empty.cols).toEqual([]);
    expect(empty.profileImageUrl).toBeNull();
    expect(empty.label).toBe("");
  });
});
