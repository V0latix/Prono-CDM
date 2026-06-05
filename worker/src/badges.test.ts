import { describe, expect, it } from "vitest";
import { getUserBadges } from "./badges";
import type { Env, PredictionRow } from "./types";

type BadgeRow = PredictionRow & {
  status: string;
  kickoff_at: string;
};

type FakeBadgeDbOptions = {
  predictionRows: BadgeRow[];
  days: Array<{ day: string; match_count: number }>;
  dayRows: Record<string, PredictionRow[]>;
};

function predictionRow(overrides: Partial<BadgeRow> = {}): BadgeRow {
  return {
    id: overrides.id ?? "prediction-1",
    user_id: "user-1",
    match_id: overrides.match_id ?? "match-1",
    predicted_home_score: 1,
    predicted_away_score: 0,
    predicted_winner_team: "France",
    predicted_winner_code: "HOME_TEAM",
    points: 3,
    exact_score: overrides.exact_score ?? 0,
    correct_result: overrides.correct_result ?? 1,
    correct_goal_diff: overrides.correct_goal_diff ?? 0,
    created_at: overrides.created_at ?? "2026-06-15T17:30:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T17:30:00.000Z",
    status: overrides.status ?? "FINISHED",
    kickoff_at: overrides.kickoff_at ?? "2026-06-15T18:00:00.000Z"
  };
}

function fakeEnv(options: FakeBadgeDbOptions): Env {
  const db = {
    prepare(sql: string) {
      let boundDay = "";
      return {
        bind(_userId: string, day?: string) {
          boundDay = day ?? "";
          return this;
        },
        async all<T>() {
          if (sql.includes("SELECT predictions.*, matches.status, matches.kickoff_at")) {
            return { results: options.predictionRows as T[] };
          }

          if (sql.includes("SELECT substr(kickoff_at, 1, 10) AS day")) {
            return { results: options.days as T[] };
          }

          if (sql.includes("LEFT JOIN predictions")) {
            return { results: (options.dayRows[boundDay] ?? []) as T[] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      };
    }
  };

  return { DB: db as unknown as D1Database };
}

describe("profile badges", () => {
  it("awards social badges from finished predictions and perfect completed days", async () => {
    const first = predictionRow({ id: "p1", match_id: "m1", exact_score: 1, updated_at: "2026-06-15T17:30:00.000Z" });
    const second = predictionRow({ id: "p2", match_id: "m2", kickoff_at: "2026-06-15T21:00:00.000Z" });
    const third = predictionRow({ id: "p3", match_id: "m3", kickoff_at: "2026-06-16T18:00:00.000Z" });

    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [first, second, third],
        days: [{ day: "2026-06-15", match_count: 2 }],
        dayRows: {
          "2026-06-15": [first, second]
        }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toEqual({
      first_exact: true,
      correct_streak_3: true,
      last_minute: true,
      perfect_day: true
    });
  });

  it("does not award streak or perfect day badges when a finished match is missed", async () => {
    const success = predictionRow({ id: "p1", match_id: "m1", exact_score: 0, correct_result: 1 });
    const miss = predictionRow({
      id: "",
      match_id: "m2",
      points: 0,
      exact_score: 0,
      correct_result: 0,
      correct_goal_diff: 0,
      updated_at: "2026-06-15T12:00:00.000Z"
    });

    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [success, miss],
        days: [{ day: "2026-06-15", match_count: 2 }],
        dayRows: {
          "2026-06-15": [success, miss]
        }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      first_exact: false,
      correct_streak_3: false,
      perfect_day: false
    });
  });
});
