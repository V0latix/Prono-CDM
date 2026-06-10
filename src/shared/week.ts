// Calcul pur de la fenêtre "semaine en cours" (lundi 00h -> lundi suivant 00h).
// Les bornes sont calculées en heure locale puis exprimées en ISO (UTC) pour être
// comparées directement à `matches.kickoff_at` (stocké en ISO UTC).

export type WeekRange = { from: string; to: string };

export function currentWeekRange(now: Date = new Date()): WeekRange {
  const day = (now.getDay() + 6) % 7; // lundi = 0, dimanche = 6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { from: monday.toISOString(), to: nextMonday.toISOString() };
}
