import { describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "./email";
import { sendPredictionReminders } from "./notifications";
import type { Env } from "./types";

type FakeMatch = { id: string; home_team: string; away_team: string; kickoff_at: string };
type FakeUser = { user_id: string; email: string; token: string };

type FakeDbOptions = {
  matches: FakeMatch[];
  users: FakeUser[];
  predictionsByUser?: Record<string, string[]>;
  logByUser?: Record<string, string[]>;
};

function fakeEnv(options: FakeDbOptions) {
  const inserted: Array<{ user_id: string; match_id: string; kind: string }> = [];

  const db = {
    prepare(sql: string) {
      const statement = {
        _args: [] as unknown[],
        bind(...args: unknown[]) {
          return { ...statement, _args: args };
        },
        async all<T>() {
          if (sql.includes("FROM matches")) {
            return { results: options.matches as T[] };
          }
          if (sql.includes("FROM user_notifications")) {
            return { results: options.users as T[] };
          }
          if (sql.includes("FROM predictions")) {
            const userId = this._args[0] as string;
            const ids = options.predictionsByUser?.[userId] ?? [];
            return { results: ids.map((match_id) => ({ match_id })) as T[] };
          }
          if (sql.includes("FROM notification_log")) {
            const userId = this._args[0] as string;
            const ids = options.logByUser?.[userId] ?? [];
            return { results: ids.map((match_id) => ({ match_id })) as T[] };
          }
          throw new Error(`Unexpected query: ${sql}`);
        }
      };
      return statement;
    },
    async batch(statements: Array<{ _args: unknown[] }>) {
      for (const statement of statements) {
        inserted.push({
          user_id: statement._args[0] as string,
          match_id: statement._args[1] as string,
          kind: statement._args[2] as string
        });
      }
      return [];
    }
  };

  return { env: { DB: db } as unknown as Env, inserted };
}

function matchRow(overrides: Partial<FakeMatch> = {}): FakeMatch {
  return {
    id: overrides.id ?? "m1",
    home_team: overrides.home_team ?? "France",
    away_team: overrides.away_team ?? "Brésil",
    kickoff_at: overrides.kickoff_at ?? "2026-06-15T19:00:00.000Z"
  };
}

describe("sendPredictionReminders", () => {
  const now = new Date("2026-06-15T08:00:00.000Z");

  it("envoie un rappel aux joueurs vérifiés sans prono et journalise les matchs", async () => {
    const { env, inserted } = fakeEnv({
      matches: [matchRow({ id: "m1" }), matchRow({ id: "m2", home_team: "Espagne" })],
      users: [{ user_id: "user-1", email: "joueur@example.com", token: "tok1" }],
      predictionsByUser: { "user-1": [] }
    });
    const sentMessages: EmailMessage[] = [];
    const send = vi.fn(async (_env: Env, message: EmailMessage) => {
      sentMessages.push(message);
      return true;
    });

    const summary = await sendPredictionReminders(env, { now, send });

    expect(summary).toEqual({ usersNotified: 1, matchesReminded: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentMessages[0].to).toBe("joueur@example.com");
    expect(inserted).toEqual([
      { user_id: "user-1", match_id: "m1", kind: "reminder" },
      { user_id: "user-1", match_id: "m2", kind: "reminder" }
    ]);
  });

  it("ignore les matchs déjà pronostiqués ou déjà rappelés", async () => {
    const { env, inserted } = fakeEnv({
      matches: [matchRow({ id: "m1" }), matchRow({ id: "m2" }), matchRow({ id: "m3" })],
      users: [{ user_id: "user-1", email: "joueur@example.com", token: "tok1" }],
      predictionsByUser: { "user-1": ["m1"] },
      logByUser: { "user-1": ["m2"] }
    });
    const send = vi.fn(async () => true);

    const summary = await sendPredictionReminders(env, { now, send });

    expect(summary).toEqual({ usersNotified: 1, matchesReminded: 1 });
    expect(inserted).toEqual([{ user_id: "user-1", match_id: "m3", kind: "reminder" }]);
  });

  it("n'envoie rien et ne journalise rien si tout est déjà pronostiqué", async () => {
    const { env, inserted } = fakeEnv({
      matches: [matchRow({ id: "m1" })],
      users: [{ user_id: "user-1", email: "joueur@example.com", token: "tok1" }],
      predictionsByUser: { "user-1": ["m1"] }
    });
    const send = vi.fn(async () => true);

    const summary = await sendPredictionReminders(env, { now, send });

    expect(summary).toEqual({ usersNotified: 0, matchesReminded: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("ne journalise pas quand l'envoi échoue (clé manquante par ex.)", async () => {
    const { env, inserted } = fakeEnv({
      matches: [matchRow({ id: "m1" })],
      users: [{ user_id: "user-1", email: "joueur@example.com", token: "tok1" }],
      predictionsByUser: { "user-1": [] }
    });
    const send = vi.fn(async () => false);

    const summary = await sendPredictionReminders(env, { now, send });

    expect(summary).toEqual({ usersNotified: 0, matchesReminded: 0 });
    expect(inserted).toEqual([]);
  });

  it("ne fait aucune requête utilisateur s'il n'y a pas de match à venir", async () => {
    const { env } = fakeEnv({ matches: [], users: [] });
    const send = vi.fn(async () => true);

    const summary = await sendPredictionReminders(env, { now, send });

    expect(summary).toEqual({ usersNotified: 0, matchesReminded: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
