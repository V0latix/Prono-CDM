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

// ── Parcours d'étape (page /en/stage-N) ──────────────────────────────────────
//
// La page de détail d'une étape porte, en clair :
//   - l'en-tête `stageHeader__infos` : date, route (Ville > Ville), type ;
//   - l'image de profil ASO (`sporting__content__img` / `data-src=...tdf26-profils...`) ;
//   - la table d'itinéraire `sporting__table` où chaque point est un
//     `<tr class="itinerary__checkpoint--{code}">` : les cols catégorisés ont un
//     code 1/2/3/4 (et hc), les autres points (départ r, arrivée a, villes n…) sont
//     ignorés. Les barèmes vert/pois sont calculés à part (catégorie standard ASO).

export type LetourCol = { category: string; name: string; km: number | null };

export type LetourStageDetail = {
  label: string;
  type: string; // 'flat' | 'hilly' | 'mountain' | 'itt' | 'ttt' | ''
  date: string | null; // 'YYYY-MM-DD'
  profileImageUrl: string | null;
  colsMapUrl: string | null; // "carte des points chauds" letour (cols + sprints)
  cols: LetourCol[];
};

function decodeText(s: string): string {
  return s
    .replace(/<wbr\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapStageType(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("team time")) return "ttt";
  if (t.includes("individual time") || t.includes("time-trial") || t.includes("time trial"))
    return "itt";
  if (t.includes("mountain")) return "mountain";
  if (t.includes("hilly")) return "hilly";
  if (t.includes("flat")) return "flat";
  return "";
}

const COL_CATEGORIES = new Set(["1", "2", "3", "4", "hc"]);

export function parseStageDetail(html: string): LetourStageDetail {
  const yearMatch = html.match(/Tour de France\s+(\d{4})/);
  const year = yearMatch ? yearMatch[1] : "2026";

  // La page liste plusieurs étapes (précédente / courante / suivante), chacune avec
  // son bloc `stageHeader__infos`. Le <title> désigne l'étape COURANTE de façon
  // fiable : on en tire le libellé, puis on choisit le bloc dont la route
  // correspond pour lire la date et le type au bon endroit.
  const titleMatch = html.match(
    /<title>\s*Stage\s+\d+\s*-\s*([\s\S]*?)\s*-\s*Tour de France/i
  );
  const label = titleMatch ? decodeText(titleMatch[1]).replace(/\s*>\s*/g, " → ") : "";

  let date: string | null = null;
  let type = "";
  // Split sur le conteneur `class="stageHeader__infos"` (le `"` évite de matcher
  // les sous-classes `stageHeader__infos__date`/`__route`).
  for (const seg of html.split(/(?=stageHeader__infos")/)) {
    const r = seg.match(/stageHeader__infos__route"[^>]*>([\s\S]*?)<\/span>\s*<\/h1>/);
    if (!r) continue;
    const segLabel = decodeText(r[1]).replace(/\s*>\s*/g, " → ");
    if (label && segLabel !== label) continue;
    const dm = seg.match(/stageHeader__infos__date"[^>]*>([\s\S]*?)<\/div>/);
    const md = dm ? decodeText(dm[1]).match(/(\d{2})\/(\d{2})/) : null;
    date = md ? `${year}-${md[1]}-${md[2]}` : null;
    const tm = seg.match(/Type<\/span>[\s\S]*?<\/?br\s*\/?>([\s\S]*?)<\/p>/i);
    type = tm ? mapStageType(decodeText(tm[1])) : "";
    break;
  }

  const img = html.match(/sporting__content__img[^>]*\sdata-src="([^"]+)"/);
  const profileImageUrl = img ? img[1] : null;

  // Carte des cols / points chauds de l'étape (une seule par page = étape courante).
  const mapMatch = html.match(/https:\/\/img\.aso\.fr\/[^"']*cartepot[^"']*/i);
  const colsMapUrl = mapMatch ? mapMatch[0] : null;

  const cols: LetourCol[] = [];
  const rowRe = /<tr[^>]*itinerary__checkpoint--([a-z0-9]+)[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const code = m[1].toLowerCase();
    if (!COL_CATEGORIES.has(code)) continue;
    const body = m[2];
    const nameMatch = body.match(/itinerary__name"[^>]*>([\s\S]*?)<\/td>/);
    const name = nameMatch ? decodeText(nameMatch[1]) : "";
    if (!name) continue;
    const kmMatch = body.match(/<td>\s*([\d.,]+)\s*<\/td>/);
    const km = kmMatch ? Number(kmMatch[1].replace(",", ".")) : null;
    cols.push({ category: code === "hc" ? "HC" : code, name, km });
  }

  return { label, type, date, profileImageUrl, colsMapUrl, cols };
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
