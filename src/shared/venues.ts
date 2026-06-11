// Stade de chaque match, cure en code. football-data.org (plan gratuit) ne
// renvoie pas le champ `venue` : on fournit donc le stade via ce mapping (par id
// football-data), comme pour les chaines TV. Source : Wikipedia FR (calendrier
// CDM 2026, phase de groupes). Les matchs a elimination directe (equipes encore
// "a definir") seront ajoutes au fil du tournoi.

export const VENUE_OVERRIDES: Record<string, string> = {
  "537327": "Estadio Azteca",
  "537328": "Estadio Akron",
  "537329": "Mercedes-Benz Stadium",
  "537330": "Estadio Akron",
  "537331": "Estadio Azteca",
  "537332": "Estadio BBVA",
  "537333": "BMO Field",
  "537334": "Levi's Stadium",
  "537335": "SoFi Stadium",
  "537336": "BC Place",
  "537337": "BC Place",
  "537338": "Lumen Field",
  "537339": "MetLife Stadium",
  "537340": "Gillette Stadium",
  "537341": "Lincoln Financial Field",
  "537342": "Gillette Stadium",
  "537343": "Hard Rock Stadium",
  "537344": "Mercedes-Benz Stadium",
  "537345": "SoFi Stadium",
  "537346": "BC Place",
  "537347": "Levi's Stadium",
  "537348": "Lumen Field",
  "537349": "SoFi Stadium",
  "537350": "Levi's Stadium",
  "537351": "NRG Stadium",
  "537352": "Lincoln Financial Field",
  "537353": "BMO Field",
  "537354": "Arrowhead Stadium",
  "537355": "MetLife Stadium",
  "537356": "Lincoln Financial Field",
  "537357": "AT&T Stadium",
  "537358": "Estadio BBVA",
  "537359": "NRG Stadium",
  "537360": "Estadio BBVA",
  "537361": "Arrowhead Stadium",
  "537362": "AT&T Stadium",
  "537363": "Lumen Field",
  "537364": "SoFi Stadium",
  "537365": "SoFi Stadium",
  "537366": "BC Place",
  "537367": "BC Place",
  "537368": "Lumen Field",
  "537369": "Mercedes-Benz Stadium",
  "537370": "Hard Rock Stadium",
  "537371": "Mercedes-Benz Stadium",
  "537372": "Hard Rock Stadium",
  "537373": "Estadio Akron",
  "537374": "NRG Stadium",
  "537391": "MetLife Stadium",
  "537392": "Gillette Stadium",
  "537393": "Lincoln Financial Field",
  "537394": "MetLife Stadium",
  "537395": "Gillette Stadium",
  "537396": "BMO Field",
  "537397": "Arrowhead Stadium",
  "537398": "Levi's Stadium",
  "537399": "AT&T Stadium",
  "537400": "Levi's Stadium",
  "537401": "AT&T Stadium",
  "537402": "Arrowhead Stadium",
  "537403": "NRG Stadium",
  "537404": "Estadio Azteca",
  "537405": "NRG Stadium",
  "537406": "Estadio Akron",
  "537407": "Hard Rock Stadium",
  "537408": "Mercedes-Benz Stadium",
  "537409": "AT&T Stadium",
  "537410": "BMO Field",
  "537411": "Gillette Stadium",
  "537412": "BMO Field",
  "537413": "MetLife Stadium",
  "537414": "Lincoln Financial Field"
};

// Stade d'un match : valeur de l'API si elle existe un jour, sinon le mapping
// cure, sinon null.
export function resolveVenue(externalId: string, apiVenue: string | null): string | null {
  const fromApi = (apiVenue ?? "").trim();
  if (fromApi) return fromApi;
  return VENUE_OVERRIDES[externalId] ?? null;
}
