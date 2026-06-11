import { describe, expect, it } from "vitest";
import { getUserBadges } from "./badges";
import type { Env, PredictionRow } from "./types";

type BadgeRow = PredictionRow & {
  status: string;
  kickoff_at: string;
  stage: string;
  home_team: string;
  away_team: string;
};

type FakeBadgeDbOptions = {
  predictionRows: BadgeRow[];
  perfectDays?: Array<{ day: string; match_count: number }>;
  perfectDayRows?: Record<string, PredictionRow[]>;
  goodStudentRows?: Array<{
    id: string;
    day: string;
    kickoff_at: string;
    prediction_id: string | null;
    updated_at: string | null;
  }>;
  favoriteTeam?: string;
  viewedProfile?: boolean;
  standings?: Array<{ user_id: string; total_points: number; group_points: number }>;
  groupStage?: { group_total: number; group_finished: number };
};

function predictionRow(overrides: Partial<BadgeRow> = {}): BadgeRow {
  return {
    id: overrides.id ?? "prediction-1",
    user_id: "user-1",
    match_id: overrides.match_id ?? "match-1",
    predicted_home_score: overrides.predicted_home_score ?? 1,
    predicted_away_score: overrides.predicted_away_score ?? 0,
    predicted_winner_team: overrides.predicted_winner_team ?? "France",
    predicted_winner_code: overrides.predicted_winner_code ?? "HOME_TEAM",
    points: overrides.points ?? 3,
    exact_score: overrides.exact_score ?? 0,
    correct_result: overrides.correct_result ?? 1,
    correct_goal_diff: overrides.correct_goal_diff ?? 0,
    created_at: overrides.created_at ?? "2026-06-15T17:30:00.000Z",
    updated_at: overrides.updated_at ?? "2026-06-15T17:30:00.000Z",
    status: overrides.status ?? "FINISHED",
    kickoff_at: overrides.kickoff_at ?? "2026-06-15T18:00:00.000Z",
    stage: overrides.stage ?? "GROUP_STAGE",
    home_team: overrides.home_team ?? "France",
    away_team: overrides.away_team ?? "Argentine"
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

          if (sql.includes("SELECT matches.id, substr(matches.kickoff_at, 1, 10) AS day")) {
            return { results: (options.goodStudentRows ?? []) as T[] };
          }

          if (sql.includes("SELECT substr(kickoff_at, 1, 10) AS day")) {
            return { results: (options.perfectDays ?? []) as T[] };
          }

          if (sql.includes("SUM(predictions.points) AS total_points")) {
            return { results: (options.standings ?? []) as T[] };
          }

          if (sql.includes("LEFT JOIN predictions")) {
            return { results: (options.perfectDayRows?.[boundDay] ?? []) as T[] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        },
        async first<T>() {
          if (sql.includes("SELECT favorite_team FROM user_profiles")) {
            return options.favoriteTeam ? ({ favorite_team: options.favoriteTeam } as T) : null;
          }

          if (sql.includes("SELECT viewed_user_id FROM profile_views")) {
            return options.viewedProfile ? ({ viewed_user_id: "user-2" } as T) : null;
          }

          if (sql.includes("AS group_total")) {
            return (options.groupStage ?? { group_total: 0, group_finished: 0 }) as T;
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      };
    }
  };

  return { DB: db as unknown as D1Database };
}

describe("profile badges", () => {
  it("awards the selected fun badges from predictions, profile preferences, and rival profile views", async () => {
    const first = predictionRow({
      id: "p1",
      match_id: "m1",
      predicted_home_score: 3,
      predicted_away_score: 2,
      exact_score: 1,
      correct_goal_diff: 1,
      updated_at: "2026-06-15T17:30:00.000Z"
    });
    const second = predictionRow({
      id: "p2",
      match_id: "m2",
      exact_score: 1,
      correct_goal_diff: 1,
      created_at: "2026-06-15T19:00:00.000Z",
      updated_at: "2026-06-15T20:30:00.000Z",
      kickoff_at: "2026-06-15T21:00:00.000Z"
    });
    const third = predictionRow({ id: "p3", match_id: "m3", kickoff_at: "2026-06-16T18:00:00.000Z" });
    const ruthless = predictionRow({
      id: "p4",
      match_id: "m4",
      home_team: "France",
      away_team: "Brésil",
      predicted_winner_team: "Brésil",
      points: 3,
      exact_score: 0,
      correct_result: 1,
      kickoff_at: "2026-06-17T18:00:00.000Z"
    });

    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [first, second, third, ruthless],
        perfectDays: [{ day: "2026-06-15", match_count: 2 }],
        perfectDayRows: {
          "2026-06-15": [first, second]
        },
        goodStudentRows: [
          {
            id: "m1",
            day: "2026-06-15",
            kickoff_at: "2026-06-15T18:00:00.000Z",
            prediction_id: "p1",
            updated_at: "2026-06-15T17:30:00.000Z"
          },
          {
            id: "m2",
            day: "2026-06-15",
            kickoff_at: "2026-06-15T21:00:00.000Z",
            prediction_id: "p2",
            updated_at: "2026-06-15T20:30:00.000Z"
          }
        ],
        favoriteTeam: "France",
        viewedProfile: true
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      first_exact: true,
      correct_streak_3: true,
      last_minute: true,
      perfect_day: true,
      good_student: true,
      madame_irma: true,
      emotional_var: true,
      ruthless: true,
      wild_optimist: true,
      rivalry_started: true,
      locker_room_vibe: true
    });
  });

  it("awards the black cat badge after five missed predictions in a row", async () => {
    const misses = Array.from({ length: 5 }, (_, index) =>
      predictionRow({
        id: `p${index + 1}`,
        match_id: `m${index + 1}`,
        points: 0,
        exact_score: 0,
        correct_result: 0,
        correct_goal_diff: 0,
        kickoff_at: `2026-06-${15 + index}T18:00:00.000Z`
      })
    );

    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: misses,
        goodStudentRows: [],
        favoriteTeam: "France"
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      black_cat: true,
      madame_irma: false,
      correct_streak_3: false,
      perfect_day: false
    });
  });

  it("does not award good student or perfect day badges when a day has a missing prediction", async () => {
    const success = predictionRow({ id: "p1", match_id: "m1", exact_score: 0, correct_result: 1 });
    const missedDayPrediction = predictionRow({
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
        predictionRows: [success, missedDayPrediction],
        perfectDays: [{ day: "2026-06-15", match_count: 2 }],
        perfectDayRows: {
          "2026-06-15": [success, missedDayPrediction]
        },
        goodStudentRows: [
          {
            id: "m1",
            day: "2026-06-15",
            kickoff_at: "2026-06-15T18:00:00.000Z",
            prediction_id: "p1",
            updated_at: "2026-06-15T17:30:00.000Z"
          },
          {
            id: "m2",
            day: "2026-06-15",
            kickoff_at: "2026-06-15T21:00:00.000Z",
            prediction_id: null,
            updated_at: null
          }
        ],
        favoriteTeam: "France"
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      first_exact: false,
      correct_streak_3: false,
      good_student: false,
      perfect_day: false
    });
  });

  it("awards points and exact-score milestones plus the final badge", async () => {
    // Dix scores exacts a 10 points chacun => 100 points et palier exact_10.
    const rows = Array.from({ length: 10 }, (_, index) =>
      predictionRow({
        id: `p${index + 1}`,
        match_id: `m${index + 1}`,
        points: 10,
        exact_score: 1,
        correct_result: 1,
        correct_goal_diff: 1,
        stage: index === 9 ? "FINAL" : "GROUP_STAGE",
        kickoff_at: `2026-06-${15 + index}T18:00:00.000Z`
      })
    );

    const badges = await getUserBadges(
      fakeEnv({ predictionRows: rows, favoriteTeam: "France" }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      points_100: true,
      exact_10: true,
      exact_20: false,
      exact_30: false,
      final_exact: true
    });
  });

  it("awards last place when the player trails the standings", async () => {
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        standings: [
          { user_id: "user-1", total_points: 5, group_points: 5 },
          { user_id: "user-2", total_points: 40, group_points: 40 }
        ],
        groupStage: { group_total: 48, group_finished: 12 }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      last_place: true,
      group_stage_first: false
    });
  });

  it("does not award last place when every player is tied", async () => {
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        standings: [
          { user_id: "user-1", total_points: 0, group_points: 0 },
          { user_id: "user-2", total_points: 0, group_points: 0 }
        ]
      }),
      "user-1"
    );

    expect(badges.find((badge) => badge.id === "last_place")?.earned).toBe(false);
  });

  it("crowns the group-stage king once the group stage is complete", async () => {
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        standings: [
          { user_id: "user-1", total_points: 30, group_points: 30 },
          { user_id: "user-2", total_points: 20, group_points: 20 }
        ],
        groupStage: { group_total: 48, group_finished: 48 }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      group_stage_first: true,
      last_place: false
    });
  });

  it("does not crown the group-stage king before the group stage ends", async () => {
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        standings: [
          { user_id: "user-1", total_points: 30, group_points: 30 },
          { user_id: "user-2", total_points: 20, group_points: 20 }
        ],
        groupStage: { group_total: 48, group_finished: 20 }
      }),
      "user-1"
    );

    expect(badges.find((badge) => badge.id === "group_stage_first")?.earned).toBe(false);
  });

  it("awards the two-perfect-days-in-a-row badge for consecutive flawless days", async () => {
    const success = predictionRow({ exact_score: 0, correct_result: 1 });
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        perfectDays: [
          { day: "2026-06-15", match_count: 2 },
          { day: "2026-06-16", match_count: 2 }
        ],
        perfectDayRows: {
          "2026-06-15": [
            predictionRow({ ...success, id: "a1" }),
            predictionRow({ ...success, id: "a2" })
          ],
          "2026-06-16": [
            predictionRow({ ...success, id: "b1" }),
            predictionRow({ ...success, id: "b2" })
          ]
        }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      perfect_day: true,
      perfect_streak_2_days: true
    });
  });

  it("does not award the streak badge for non-consecutive perfect days", async () => {
    const success = predictionRow({ exact_score: 0, correct_result: 1 });
    const badges = await getUserBadges(
      fakeEnv({
        predictionRows: [],
        perfectDays: [
          { day: "2026-06-15", match_count: 2 },
          { day: "2026-06-18", match_count: 2 }
        ],
        perfectDayRows: {
          "2026-06-15": [
            predictionRow({ ...success, id: "a1" }),
            predictionRow({ ...success, id: "a2" })
          ],
          "2026-06-18": [
            predictionRow({ ...success, id: "b1" }),
            predictionRow({ ...success, id: "b2" })
          ]
        }
      }),
      "user-1"
    );

    expect(Object.fromEntries(badges.map((badge) => [badge.id, badge.earned]))).toMatchObject({
      perfect_day: true,
      perfect_streak_2_days: false
    });
  });
});
