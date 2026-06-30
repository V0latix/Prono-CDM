// Parsing pur (sans reseau) des fragments de classement letour.fr.
//
// Source : la page officielle letour.fr expose, par etape, des fragments AJAX
// `/en/ajax/ranking/{stage}/{type}/{hash}/subtab` contenant une <table>. Chaque
// ligne de donnees porte la position dans `...row__position ...><span>N</span>`
// et un lien coureur `/en/rider/{dossard}/{equipe-slug}/{nom-slug}`. On s'appuie
// sur ce lien (stable) plutot que sur l'ordre des cellules.
//
// Types de classement utiles :
//   ite = resultat d'etape       itg = general (jaune)
//   ipg = points (vert)          img = montagne (pois)
//   ijg = meilleur jeune (blanc) ice = combativite (1 coureur recompense)
//
// Identite coureur = numero de dossard (stable sur la duree d'un Tour).

export type LetourRankingRow = {
  rank: number;
  bib: string;
  rider: string;
  team: string;
  nationality: string | null;
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseRankingTable(html: string): LetourRankingRow[] {
  const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/);
  if (!table) return [];
  const rows = table[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const out: LetourRankingRow[] = [];
  for (const tr of rows) {
    const pos = tr.match(/row__position[^>]*>\s*<span>\s*(\d+)\s*<\/span>/);
    const link = tr.match(/\/en\/rider\/(\d+)\/([^/"]+)\/([^/"]+)/);
    if (!pos || !link) continue; // ligne d'en-tete ou ligne sans coureur
    const flag = tr.match(/data-class="flag--([a-z]+)"/);
    out.push({
      rank: Number(pos[1]),
      bib: link[1],
      team: titleCase(link[2]),
      rider: titleCase(link[3]),
      nationality: flag ? flag[1].toUpperCase() : null
    });
  }
  return out;
}

// Le fragment combativite (`ice`) ne contient qu'un coureur : son dossard.
export function parseCombativity(html: string): string | null {
  const rows = parseRankingTable(html);
  return rows.length ? rows[0].bib : null;
}

export type LetourAjaxPaths = Record<string, string>;

// Lit, sur la page d'etape, le chemin AJAX de chaque type de classement.
// Les classements d'etape (ite, ice...) sont en clair (`data-tabs-ajax`), mais
// les classements generaux (itg, ipg, img, ijg) sont dans un JSON echappe
// (`data-ajax-stack="...\/en\/ajax\/..."`) : on de-echappe `\/` avant de scanner.
export function extractAjaxRankingPaths(html: string): LetourAjaxPaths {
  const out: LetourAjaxPaths = {};
  const unescaped = html.replace(/\\\//g, "/");
  const re = /\/en\/ajax\/ranking\/\d+\/([a-z]+)\/[a-f0-9]+\/[a-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(unescaped)) !== null) {
    if (!(m[1] in out)) out[m[1]] = m[0];
  }
  return out;
}
