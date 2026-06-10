// Fenêtre de dates pour le classement hebdomadaire.
//
// L'endpoint /api/leaderboard accepte des `from`/`to` fournis par le client. On
// les normalise en ISO UTC canonique (`...Z`) pour que la comparaison contre
// `matches.kickoff_at` (stocké en ISO UTC canonique) reste chronologique, même
// si le client envoie une date seule (`2026-06-15`) ou un décalage horaire
// (`2026-06-15T00:00:00+02:00`). Une fenêtre vide, partielle ou inversée est
// rejetée.

export type DateWindow = { from: string; to: string };

export function parseDateWindow(
  from: string | null | undefined,
  to: string | null | undefined
): DateWindow | null {
  if (!from && !to) return null;
  if (!from || !to) throw new RangeError("Fenêtre de dates incomplète.");
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
    throw new RangeError("Fenêtre de dates invalide.");
  }
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString()
  };
}
