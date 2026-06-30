// Barèmes de points maillot vert / maillot à pois (règles ASO standard).
// La source letour expose la catégorie d'un col, pas les points : on les dérive
// ici de la catégorie (pois) et du type d'étape (vert, à l'arrivée), plus le
// barème fixe du sprint intermédiaire (vert). Module pur, partagé front/Worker,
// purement informatif (n'affecte pas le scoring du jeu).

// Maillot à pois : points par place au sommet, selon la catégorie du col.
const POLKA: Record<string, number[]> = {
  HC: [20, 15, 12, 10, 8, 6, 4, 2],
  "1": [10, 8, 6, 4, 2, 1],
  "2": [5, 3, 2, 1],
  "3": [2, 1],
  "4": [1]
};

// Une arrivée au sommet de col HC ou 1re catégorie double les points.
export function polkaPoints(category: string, summitFinish = false): number[] {
  const base = POLKA[category.toUpperCase()] ?? [];
  if (summitFinish && (category.toUpperCase() === "HC" || category === "1")) {
    return base.map((p) => p * 2);
  }
  return base;
}

// Maillot vert : barème à l'arrivée selon le type d'étape.
const GREEN_FINISH: Record<string, number[]> = {
  flat: [50, 30, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2],
  hilly: [30, 25, 22, 19, 17, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2],
  mountain: [20, 17, 15, 13, 11, 10, 9, 7, 6, 5, 4, 3, 2],
  itt: [20, 17, 15, 13, 11, 10, 9, 7, 6, 5, 4, 3, 2],
  ttt: [20, 17, 15, 13, 11, 10, 9, 7, 6, 5, 4, 3, 2]
};

export function greenFinishPoints(stageType: string): number[] {
  return GREEN_FINISH[stageType] ?? GREEN_FINISH.flat;
}

// Sprint intermédiaire : barème fixe (maillot vert).
export const GREEN_SPRINT_POINTS: number[] = [20, 17, 15, 13, 11, 10, 9, 7, 6, 5, 4, 3, 2, 1];
