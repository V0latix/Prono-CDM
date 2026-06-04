import type { Winner } from "../../src/shared/scoring";

export type Env = {
  DB: D1Database;
  FOOTBALL_DATA_TOKEN?: string;
  FOOTBALL_DATA_COMPETITION?: string;
  FOOTBALL_DATA_SEASON?: string;
  FOOTBALL_DATA_BASE_URL?: string;
  FRONTEND_ORIGIN?: string;
  ADMIN_TOKEN?: string;
  COOKIE_SAMESITE?: "Lax" | "Strict" | "None";
  COOKIE_SECURE?: "true" | "false" | "auto";
};

export type User = {
  id: string;
  pseudo: string;
  created_at: string;
};

export type MatchRow = {
  id: string;
  external_id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  winner_team: string | null;
  winner_code: Winner;
  last_synced_at: string;
};

export type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  predicted_winner_team: string | null;
  predicted_winner_code: Winner;
  points: number;
  exact_score: number;
  correct_result: number;
  correct_goal_diff: number;
  created_at: string;
  updated_at: string;
};

export type UserProfileRow = {
  user_id: string;
  photo_url: string;
  tagline: string;
  favorite_team: string;
  created_at: string;
  updated_at: string;
};
