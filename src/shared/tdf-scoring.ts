export type StageResult = { rank: number; riderId: string }[];
export type Podium = [string | null, string | null, string | null];
export type GrandDepartPrediction = {
  yellow: Podium;
  white: Podium;
  green: string | null;
  polka: string | null;
};
export type GrandDepartResults = GrandDepartPrediction;

// Prono d'étape : 10 coureurs non ordonnés. Chaque coureur présent dans le
// top 10 réel rapporte l'inverse de sa place réelle (10e -> 10 ... 1er -> 1).
// Combatif juste = +10. Coureurs en double comptés une seule fois.
export function scoreStage(
  riderIds: string[],
  combativePick: string | null,
  result: StageResult,
  combativeRiderId: string | null
): number {
  const rankByRider = new Map(result.map((r) => [r.riderId, r.rank]));
  let points = 0;
  for (const id of new Set(riderIds)) {
    const rank = rankByRider.get(id);
    if (rank !== undefined && rank >= 1 && rank <= 10) {
      points += 11 - rank;
    }
  }
  if (combativePick && combativeRiderId && combativePick === combativeRiderId) {
    points += 10;
  }
  return points;
}

// Barème par place RÉELLE du coureur. Plein tarif si place exacte (le coureur
// finit à la place où tu l'avais mis), moitié si bon coureur mais mauvaise place.
const YELLOW_FULL: Record<number, number> = { 1: 80, 2: 40, 3: 20 };
const WHITE_FULL: Record<number, number> = { 1: 40, 2: 20, 3: 10 };

function scorePodium(
  predicted: Podium,
  actual: Podium,
  full: Record<number, number>
): number {
  let points = 0;
  for (let predIndex = 0; predIndex < 3; predIndex += 1) {
    const rider = predicted[predIndex];
    if (!rider) continue;
    const actualIndex = actual.findIndex((r) => r === rider);
    if (actualIndex === -1) continue; // hors podium réel
    const actualPlace = actualIndex + 1;
    const base = full[actualPlace];
    points += predIndex === actualIndex ? base : base / 2;
  }
  return points;
}

export function scoreGrandDepart(
  prediction: GrandDepartPrediction,
  results: GrandDepartResults
): number {
  let points = 0;
  points += scorePodium(prediction.yellow, results.yellow, YELLOW_FULL);
  points += scorePodium(prediction.white, results.white, WHITE_FULL);
  if (prediction.green && prediction.green === results.green) points += 40;
  if (prediction.polka && prediction.polka === results.polka) points += 40;
  return points;
}
