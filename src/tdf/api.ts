import { api } from "../api";

export type TdfRider = {
  id: string;
  name: string;
  team: string | null;
  nationality: string | null;
  is_young: number;
  status: string;
};

export type TdfStage = {
  stage_no: number;
  date: string;
  lock_at: string;
  type: string;
  label: string;
  status: string;
  combative_rider_id: string | null;
};

export const fetchTdfRiders = () =>
  api<{ riders: TdfRider[] }>("/api/tdf/riders");

export const fetchTdfStages = () =>
  api<{ stages: TdfStage[] }>("/api/tdf/stages");

export const fetchTdfDashboard = () =>
  api<{ nextStage: TdfStage | null; myPrediction: unknown }>("/api/tdf/dashboard");

export const fetchTdfLeaderboard = () =>
  api<{ leaderboard: { user_id: string; pseudo: string; points: number }[] }>("/api/tdf/leaderboard");

export const fetchTdfResults = () =>
  api<{ stages: TdfStage[]; results: { stage_no: number; rider_id: string; rank: number }[] }>("/api/tdf/results");

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
