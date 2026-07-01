// Lien "voir le profil" d'un col. Les profils d'élévation par col ne sont ni sur
// letour ni via une API : climbfinder les héberge mais sans recherche GET fiable.
// On lie donc directement les cols dont le slug climbfinder est vérifié, et on
// retombe sur une recherche climbfinder pour les autres (petites côtes souvent
// absentes de climbfinder). Aucune image cassée : c'est toujours un lien.

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Slugs climbfinder vérifiés (nom normalisé -> slug). Étendable à la main.
const CLIMBFINDER_SLUGS: Record<string, string> = {
  "col bayard": "col-bayard",
  "col d aspin": "col-d-aspin",
  "col d ornon": "col-d-ornon",
  "col de prat de bouc": "col-de-prat-de-bouc",
  "col du noyer": "col-du-noyer",
  "col du page": "col-du-page",
  "col du telegraphe": "col-du-telegraphe",
  "cote de beguey": "cote-de-beguey",
  "cote de loucrup": "cote-de-loucrup",
  "cote de mauvezin": "cote-de-mauvezin",
  "cote de la butte montmartre": "cote-de-la-butte-montmartre",
  "cote des rousses": "cote-des-rousses",
  "grand ballon": "grand-ballon",
  "les angles": "les-angles"
};

export function colProfileUrl(name: string): string {
  const slug = CLIMBFINDER_SLUGS[normalize(name)];
  if (slug) return `https://climbfinder.com/en/climbs/${slug}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`climbfinder ${name}`)}`;
}
