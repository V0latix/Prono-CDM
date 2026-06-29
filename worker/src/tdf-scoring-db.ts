import {
  scoreStage,
  scoreGrandDepart,
  type StageResult
} from "../../src/shared/tdf-scoring";
import { runD1Batch } from "./d1-batch";
import type {
  Env,
  TdfStagePredictionRow,
  TdfGrandDepartPredictionRow,
  TdfGrandDepartResultRow
} from "./types";

// Recalcule et stocke les points de tous les pronos d'une étape, à partir
// du top 10 réel et du combatif. Batché via runD1Batch (budget cron).
export async function recalculateTdfStagePoints(
  env: Env,
  stageNo: number
): Promise<void> {
  const stage = await env.DB.prepare(
    "SELECT combative_rider_id FROM tdf_stages WHERE stage_no = ?"
  ).bind(stageNo).first<{ combative_rider_id: string | null }>();

  const resultRows = await env.DB.prepare(
    "SELECT rider_id, rank FROM tdf_stage_results WHERE stage_no = ? ORDER BY rank ASC"
  ).bind(stageNo).all<{ rider_id: string; rank: number }>();
  const result: StageResult = (resultRows.results ?? []).map((r) => ({
    rank: r.rank,
    riderId: r.rider_id
  }));

  const predictions = await env.DB.prepare(
    "SELECT * FROM tdf_stage_predictions WHERE stage_no = ?"
  ).bind(stageNo).all<TdfStagePredictionRow>();

  const updates: D1PreparedStatement[] = [];
  for (const pred of predictions.results ?? []) {
    let riderIds: string[] = [];
    try {
      riderIds = JSON.parse(pred.rider_ids) as string[];
    } catch {
      riderIds = [];
    }
    const points = scoreStage(
      riderIds,
      pred.combative_rider_id,
      result,
      stage?.combative_rider_id ?? null
    );
    updates.push(
      env.DB.prepare(
        "UPDATE tdf_stage_predictions SET points = ? WHERE user_id = ? AND stage_no = ?"
      ).bind(points, pred.user_id, pred.stage_no)
    );
  }
  await runD1Batch(env, updates);
}

// Recalcule les points grand départ de tous les joueurs à partir de la ligne
// unique de résultats finaux. No-op tant que les résultats ne sont pas posés.
export async function recalculateTdfGrandDepart(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    "SELECT * FROM tdf_grand_depart_results WHERE id = 1"
  ).first<TdfGrandDepartResultRow>();
  if (!res) return;

  const preds = await env.DB.prepare(
    "SELECT * FROM tdf_grand_depart_predictions"
  ).all<TdfGrandDepartPredictionRow>();

  const results = {
    yellow: [res.yellow1, res.yellow2, res.yellow3] as [string | null, string | null, string | null],
    white: [res.white1, res.white2, res.white3] as [string | null, string | null, string | null],
    green: res.green,
    polka: res.polka
  };

  const updates: D1PreparedStatement[] = [];
  for (const pred of preds.results ?? []) {
    const points = scoreGrandDepart(
      {
        yellow: [pred.yellow1, pred.yellow2, pred.yellow3],
        white: [pred.white1, pred.white2, pred.white3],
        green: pred.green,
        polka: pred.polka
      },
      results
    );
    updates.push(
      env.DB.prepare(
        "UPDATE tdf_grand_depart_predictions SET points = ? WHERE user_id = ?"
      ).bind(points, pred.user_id)
    );
  }
  await runD1Batch(env, updates);
}
