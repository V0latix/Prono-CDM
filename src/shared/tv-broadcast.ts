// Diffuseur(s) TV francais d'un match. Aucune API qu'on utilise ne fournit cette
// donnee : on la derive donc d'un mapping cure en code. Calcul pur et testable.
//
// Droits CDM 2026 en France : beIN SPORTS diffuse l'integralite des 104 matchs.
// Le clair est partage entre TF1 et M6 (~28 matchs chacun), avec une repartition
// EDITORIALE par match qu'on ne peut pas deduire automatiquement (et qui ne suit
// pas une regle simple : les poules ne sont pas systematiquement sur TF1).
//
// Choix : defaut = beIN SPORTS partout (certain) ; on ajoute TF1 ou M6 UNIQUEMENT
// pour les matchs explicitement listes dans `BROADCAST_OVERRIDES` (par id
// football-data, stable meme quand les equipes sont "a definir"). On n'affiche
// donc jamais une chaine en clair par devinette.

export type Broadcaster = {
  key: string;
  label: string;
};

const TF1: Broadcaster = { key: "TF1", label: "TF1" };
const M6: Broadcaster = { key: "M6", label: "M6" };
const BEIN: Broadcaster = { key: "BEIN", label: "beIN SPORTS" };

const CHANNELS: Record<string, Broadcaster> = {
  TF1,
  M6,
  BEIN
};

// Surcharges manuelles : id football-data (string) -> cles de chaines, dans
// l'ordre d'affichage souhaite. Toujours inclure "BEIN" qui diffuse tous les
// matchs.
//
// Matchs de poule diffuses en clair sur M6 (source : footmercato.net, grille M6
// de la CDM 2026). Les affiches TF1 et les matchs clair de la phase finale (dont
// les equipes sont encore "a definir") seront ajoutes au fil de l'annonce.
export const BROADCAST_OVERRIDES: Record<string, string[]> = {
  "537327": ["M6", "BEIN"],
  "537329": ["M6", "BEIN"],
  "537333": ["M6", "BEIN"],
  "537334": ["M6", "BEIN"],
  "537335": ["M6", "BEIN"],
  "537337": ["M6", "BEIN"],
  "537339": ["M6", "BEIN"],
  "537342": ["M6", "BEIN"],
  "537343": ["M6", "BEIN"],
  "537348": ["M6", "BEIN"],
  "537351": ["M6", "BEIN"],
  "537353": ["M6", "BEIN"],
  "537355": ["M6", "BEIN"],
  "537357": ["M6", "BEIN"],
  "537359": ["M6", "BEIN"],
  "537361": ["M6", "BEIN"],
  "537363": ["M6", "BEIN"],
  "537365": ["M6", "BEIN"],
  "537369": ["M6", "BEIN"],
  "537370": ["M6", "BEIN"],
  "537371": ["M6", "BEIN"],
  "537391": ["M6", "BEIN"],
  "537392": ["M6", "BEIN"],
  "537393": ["M6", "BEIN"],
  "537395": ["M6", "BEIN"],
  "537399": ["M6", "BEIN"],
  "537403": ["M6", "BEIN"],
  "537405": ["M6", "BEIN"],
  "537407": ["M6", "BEIN"],
  "537409": ["M6", "BEIN"],
  "537411": ["M6", "BEIN"],
  "537413": ["M6", "BEIN"]
};

function toBroadcasters(keys: string[]): Broadcaster[] {
  const seen = new Set<string>();
  const result: Broadcaster[] = [];
  for (const key of keys) {
    const channel = CHANNELS[key];
    if (channel && !seen.has(channel.key)) {
      seen.add(channel.key);
      result.push(channel);
    }
  }
  return result;
}

// Renvoie la/les chaine(s) qui diffusent un match, dans l'ordre d'affichage.
// Surcharge manuelle si presente, sinon defaut beIN SPORTS.
export function resolveBroadcasters(externalId: string): Broadcaster[] {
  const override = BROADCAST_OVERRIDES[externalId];
  if (override && override.length > 0) {
    const channels = toBroadcasters(override);
    if (channels.length > 0) return channels;
  }
  return [BEIN];
}
