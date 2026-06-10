import { reminderEmail, sendEmail, type ReminderMatch } from "./email";
import type { Env } from "./types";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_KIND = "reminder";

type UpcomingMatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
};

type NotificationUserRow = {
  user_id: string;
  email: string;
  token: string;
};

export type ReminderOptions = {
  now?: Date;
  send?: typeof sendEmail;
};

export type ReminderSummary = {
  usersNotified: number;
  matchesReminded: number;
};

/**
 * Envoie un rappel aux joueurs qui ont activé et confirmé leurs notifications
 * et dont un prono manque pour un match qui débute dans moins de 24h.
 * Un même match n'est rappelé qu'une fois par joueur (table notification_log).
 */
export async function sendPredictionReminders(
  env: Env,
  options: ReminderOptions = {}
): Promise<ReminderSummary> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendEmail;
  const nowIso = now.toISOString();
  const windowEndIso = new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString();

  const upcoming = await env.DB.prepare(
    `SELECT id, home_team, away_team, kickoff_at
       FROM matches
      WHERE kickoff_at > ? AND kickoff_at <= ?
      ORDER BY kickoff_at`
  )
    .bind(nowIso, windowEndIso)
    .all<UpcomingMatchRow>();

  const matches = upcoming.results ?? [];
  if (matches.length === 0) {
    return { usersNotified: 0, matchesReminded: 0 };
  }

  const users = await env.DB.prepare(
    `SELECT user_id, email, token
       FROM user_notifications
      WHERE enabled = 1 AND verified = 1 AND email != ''`
  ).all<NotificationUserRow>();

  let usersNotified = 0;
  let matchesReminded = 0;

  for (const user of users.results ?? []) {
    const predicted = await env.DB.prepare(
      "SELECT match_id FROM predictions WHERE user_id = ?"
    )
      .bind(user.user_id)
      .all<{ match_id: string }>();
    const predictedIds = new Set((predicted.results ?? []).map((row) => row.match_id));

    const logged = await env.DB.prepare(
      "SELECT match_id FROM notification_log WHERE user_id = ? AND kind = ?"
    )
      .bind(user.user_id, REMINDER_KIND)
      .all<{ match_id: string }>();
    const loggedIds = new Set((logged.results ?? []).map((row) => row.match_id));

    const pending = matches.filter(
      (match) => !predictedIds.has(match.id) && !loggedIds.has(match.id)
    );
    if (pending.length === 0) continue;

    const reminderMatches: ReminderMatch[] = pending.map((match) => ({
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      kickoffAt: match.kickoff_at
    }));

    const sent = await send(env, reminderEmail(env, user.email, user.token, reminderMatches));
    if (!sent) continue;

    usersNotified += 1;
    matchesReminded += pending.length;

    const stmt = env.DB.prepare(
      "INSERT OR IGNORE INTO notification_log (user_id, match_id, kind) VALUES (?, ?, ?)"
    );
    await env.DB.batch(
      pending.map((match) => stmt.bind(user.user_id, match.id, REMINDER_KIND))
    );
  }

  return { usersNotified, matchesReminded };
}
