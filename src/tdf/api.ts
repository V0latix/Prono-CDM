import { api } from "../api";

export type TdfRider = {
  id: string;
  name: string;
  team: string | null;
  nationality: string | null;
  is_young: number;
  status: string;
};

export type TdfCol = {
  kind: string; // 'col'
  name: string;
  category: string | null; // 'HC' | '1' | '2' | '3' | '4'
  km: number | null;
};

export type TdfStage = {
  stage_no: number;
  date: string;
  lock_at: string;
  type: string;
  label: string;
  status: string;
  combative_rider_id: string | null;
  profile_image_url?: string | null;
  cols_map_url?: string | null;
  cols?: TdfCol[];
};

export const fetchTdfRiders = () =>
  api<{ riders: TdfRider[] }>("/api/tdf/riders");

export const fetchTdfStages = () =>
  api<{ stages: TdfStage[] }>("/api/tdf/stages");

export const fetchTdfDashboard = () =>
  api<{ nextStage: TdfStage | null; myPrediction: unknown }>("/api/tdf/dashboard");

export type TdfLeaderboardEntry = {
  user_id: string;
  pseudo: string;
  points: number;
  stage_points: number;
  grand_depart_points: number;
  stages_played: number;
  best_stage: number;
};

export const fetchTdfLeaderboard = () =>
  api<{ leaderboard: TdfLeaderboardEntry[] }>("/api/tdf/leaderboard");

export type TdfClassificationRow = { rank: number; rider_id: string };

export const fetchTdfResults = () =>
  api<{
    stages: TdfStage[];
    results: { stage_no: number; rider_id: string; rank: number }[];
    classifications: Record<string, TdfClassificationRow[]>;
  }>("/api/tdf/results");

export const saveTdfStagePrediction = (
  stageNo: number,
  riderIds: string[],
  combativeId: string | null
) =>
  api<unknown>(`/api/tdf/predictions/${stageNo}`, {
    method: "PUT",
    body: JSON.stringify({ riderIds, combativeId })
  });

export type TdfGrandDepartPrediction = {
  yellow: (string | null)[];
  white: (string | null)[];
  green: string | null;
  polka: string | null;
};

export const saveTdfGrandDepart = (prediction: TdfGrandDepartPrediction) =>
  api<unknown>("/api/tdf/grand-depart", { method: "PUT", body: JSON.stringify(prediction) });
