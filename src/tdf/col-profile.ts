// Image du profil d'élévation d'un col, hébergée par climbfinder
// (https://image.climbfinder.com/{slug}.png). letour ne fournit pas ces profils,
// et climbfinder n'a pas de recherche fiable : on mappe donc à la main les cols
// dont le slug a été VÉRIFIÉ (titre de la page = bon col). Les petites côtes
// absentes de climbfinder n'ont pas d'image (on n'affiche jamais un mauvais col).

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// nom normalisé -> slug climbfinder vérifié. À étendre à la main (vérifier le
// titre de https://climbfinder.com/en/climbs/{slug} avant d'ajouter).
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
  "les angles": "les-angles",
  "puy mary pas de peyrol": "pas-de-peyrol"
};

export function colProfileImage(name: string): string | null {
  const slug = CLIMBFINDER_SLUGS[normalize(name)];
  return slug ? `https://image.climbfinder.com/${slug}.png` : null;
}
