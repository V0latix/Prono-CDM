// Regroupement des matchs de la phase finale (elimination directe) PAR TOUR, a
// partir des matchs renvoyes par l'API. Calcul pur et sans UI, comme
// `standings.ts` et `scoring.ts`, pour rester testable.
//
// Limite assumee : football-data.org (et notre schema) ne fournissent PAS les
// relations de filiation entre matchs (quel match alimente quel match du tour
// suivant). Cette fonction se contente donc de regrouper les matchs "tour par
// tour" : un groupe par tour, ordonne 16es -> finale, et a l'interieur d'un tour
// un ordre deterministe par coup d'envoi (puis id). L'UI (BracketView) dessine un
// arbre dont les APPARIEMENTS sont DEDUITS positionnellement (matchs adjacents
// d'un tour -> meme match du tour suivant) : choix produit assume, le tableau
// reste donc indicatif et ne reflete pas forcement le tableau officiel.

import { getStageKind } from "./scoring";

// Sous-ensemble structurel d'un match suffisant pour batir l'arbre. Le type
// `Match` du frontend est compatible (memes champs).
export type BracketMatchInput = {
  id: string;
  stage: string;
  kickoffAt: string;
};

export type BracketRound<T extends BracketMatchInput> = {
  // Stage brut representatif du tour (pour le libelle cote UI).
  stage: string;
  // 1 = premier tour de la phase finale ... 6 = finale. Croissant.
  order: number;
  matches: T[];
};

// Ordre des tours de la phase finale, du plus tot au plus tard. La petite finale
// (3e place) precede la finale. THIRD_PLACE est teste avant FINAL car son code
// ne contient pas "FINAL".
export function knockoutRoundOrder(stage: string): number {
  const normalized = stage.toUpperCase();
  if (normalized.includes("LAST_32") || normalized.includes("ROUND_OF_32")) return 1;
  if (normalized.includes("LAST_16") || normalized.includes("ROUND_OF_16")) return 2;
  if (normalized.includes("QUARTER")) return 3;
  if (normalized.includes("SEMI")) return 4;
  if (normalized.includes("THIRD_PLACE")) return 5;
  if (normalized.includes("FINAL")) return 6;
  return 99;
}

// Regroupe les matchs a elimination directe par tour, ordonne les tours
// (16es -> finale) et trie les matchs d'un tour par coup d'envoi puis id (ordre
// deterministe et stable, PAS un ordre de chemin de tableau). Les matchs de
// poule eventuels sont ignores.
export function buildBracketRounds<T extends BracketMatchInput>(
  matches: readonly T[]
): Array<BracketRound<T>> {
  const byOrder = new Map<number, BracketRound<T>>();

  for (const match of matches) {
    if (getStageKind(match.stage) !== "KNOCKOUT") continue;
    const order = knockoutRoundOrder(match.stage);
    let round = byOrder.get(order);
    if (!round) {
      round = { stage: match.stage, order, matches: [] };
      byOrder.set(order, round);
    }
    round.matches.push(match);
  }

  const rounds = Array.from(byOrder.values()).sort((a, b) => a.order - b.order);
  for (const round of rounds) {
    round.matches.sort(
      (a, b) =>
        Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt) || a.id.localeCompare(b.id)
    );
  }
  return rounds;
}
