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
// l'ordre d'affichage souhaite. A remplir quand la grille clair (TF1/M6) est
// connue, ex. `"537000": ["M6", "BEIN"]`. Toujours inclure "BEIN" qui diffuse
// tous les matchs.
export const BROADCAST_OVERRIDES: Record<string, string[]> = {};

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
