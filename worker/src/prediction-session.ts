// Sélection de la « session » de matchs à pronostiquer sur le dashboard.
//
// Le dashboard affiche les matchs « à pronostiquer maintenant ». Regrouper par
// jour calendaire (UTC ou local) est faux pour la CDM 2026 : une soirée de
// matchs aux Amériques commence le soir heure française et se poursuit après
// minuit (01h-05h). Ces matchs de nuit tombent sur le jour calendaire suivant
// et seraient exclus alors qu'ils font partie du même lot à pronostiquer.
//
// On définit donc une session comme une suite de matchs consécutifs (triés par
// coup d'envoi) tant que l'écart entre deux coups d'envoi reste inférieur à un
// seuil (`gapHours`). Le premier « trou » plus large clôt la session : les
// matchs du lendemain forment alors le lot suivant.

// Écart maximal entre deux coups d'envoi d'une même session. Les matchs d'une
// journée s'enchaînent à ~3h d'intervalle, alors que le dernier match de nuit
// et le premier match du lendemain sont séparés de la moitié d'une journée. Un
// seuil de 9h sépare proprement les sessions sans couper les matchs de nuit.
export const SESSION_GAP_HOURS = 9;

export function selectPredictionSession<T extends { kickoff_at: string }>(
  matches: readonly T[],
  gapHours: number = SESSION_GAP_HOURS
): T[] {
  if (matches.length === 0) return [];
  const gapMs = gapHours * 60 * 60 * 1000;
  const session: T[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const prev = Date.parse(matches[i - 1].kickoff_at);
    const current = Date.parse(matches[i].kickoff_at);
    if (Number.isNaN(prev) || Number.isNaN(current)) break;
    if (current - prev >= gapMs) break;
    session.push(matches[i]);
  }
  return session;
}
