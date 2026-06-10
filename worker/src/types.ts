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
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  APP_URL?: string;
  API_URL?: string;
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
  match_group: string | null;
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

export type UserNotificationRow = {
  user_id: string;
  email: string;
  enabled: number;
  verified: number;
  token: string;
  created_at: string;
  updated_at: string;
};

export type GroupRow = {
  id: string;
  name: string;
  owner_user_id: string;
  invite_code: string | null;
  created_at: string;
};

export type GroupMemberRow = {
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
};
