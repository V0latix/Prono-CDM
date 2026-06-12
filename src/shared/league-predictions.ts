// Agrégation pure des scores les plus pronostiqués par l'ensemble de la ligue,
// affichés sous chaque match terminé dans l'onglet Résultats. La requête SQL fait
// le GROUP BY (match_id, score pronostiqué) ; ici on regroupe par match et on
// garde les `limit` scores les plus fréquents, avec un tri déterministe pour que
// l'affichage soit stable (et testable).

export type ScorelineCount = {
  home: number;
  away: number;
  count: number;
};

export type ScorelineAggregateRow = {
  match_id: string;
  home: number;
  away: number;
  count: number;
};

export function topScorelinesByMatch(
  rows: ScorelineAggregateRow[],
  limit = 3
): Map<string, ScorelineCount[]> {
  const byMatch = new Map<string, ScorelineCount[]>();

  for (const row of rows) {
    const list = byMatch.get(row.match_id) ?? [];
    list.push({ home: row.home, away: row.away, count: row.count });
    byMatch.set(row.match_id, list);
  }

  for (const [matchId, list] of byMatch) {
    // Tri : fréquence décroissante, puis score (home puis away) croissant comme
    // tie-break déterministe.
    list.sort(
      (a, b) => b.count - a.count || a.home - b.home || a.away - b.away
    );
    byMatch.set(matchId, limit >= 0 ? list.slice(0, limit) : list);
  }

  return byMatch;
}
