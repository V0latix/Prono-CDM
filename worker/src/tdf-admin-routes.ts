import { HttpError, json, parseJson, type RequestContext } from "./http";
import { runD1Batch } from "./d1-batch";
import {
  recalculateTdfStagePoints,
  recalculateTdfGrandDepart
} from "./tdf-scoring-db";
import { refreshTdfPeloton, refreshTdfRoute } from "./tour-de-france";

// Accès admin : soit le secret partagé (GitHub Action, sans compte),
// soit un user connecté avec is_admin = 1 (écran manuel front).
export function assertTdfSyncSecret(ctx: RequestContext): void {
  const header = ctx.request.headers.get("x-tdf-sync-secret");
  const secretOk =
    Boolean(ctx.env.TDF_SYNC_SECRET) && header === ctx.env.TDF_SYNC_SECRET;
  const adminOk = Boolean(ctx.user?.is_admin);
  if (!secretOk && !adminOk) throw new HttpError(403, "Accès interdit.");
}

type RosterPayload = {
  riders?: {
    id: string;
    name: string;
    team?: string;
    nationality?: string;
    isYoung?: boolean;
  }[];
  stages?: {
    stageNo: number;
    date: string;
    lockAt: string;
    type?: string;
    label?: string;
  }[];
};

export async function tdfAdminRoster(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<RosterPayload>(ctx.request);
  const stmts: D1PreparedStatement[] = [];
  for (const r of body.riders ?? []) {
    stmts.push(
      ctx.env.DB.prepare(
        `INSERT INTO tdf_riders (id, name, team, nationality, is_young, status)
         VALUES (?, ?, ?, ?, ?, 'active')
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, team = excluded.team,
           nationality = excluded.nationality, is_young = excluded.is_young`
      ).bind(r.id, r.name, r.team ?? null, r.nationality ?? null, r.isYoung ? 1 : 0)
    );
  }
  for (const s of body.stages ?? []) {
    stmts.push(
      ctx.env.DB.prepare(
        `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status)
         VALUES (?, ?, ?, ?, ?, 'upcoming')
         ON CONFLICT(stage_no) DO UPDATE SET
           date = excluded.date, lock_at = excluded.lock_at,
           type = excluded.type, label = excluded.label`
      ).bind(s.stageNo, s.date, s.lockAt, s.type ?? "flat", s.label ?? "")
    );
  }
  await runD1Batch(ctx.env, stmts);
  return json(ctx.request, ctx.env, { ok: true });
}

type StageResultPayload = {
  stageNo?: number;
  top10?: { rank: number; riderId: string }[];
  combativeId?: string | null;
};

export async function tdfAdminStageResult(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<StageResultPayload>(ctx.request);
  const stageNo = body.stageNo;
  if (!stageNo) throw new HttpError(400, "Étape manquante.");
  const top10 = Array.isArray(body.top10) ? body.top10 : [];

  // Anti-effacement : on n'écrase JAMAIS un résultat réel par du vide.
  if (top10.length === 0) {
    const existing = await ctx.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_stage_results WHERE stage_no = ?"
    )
      .bind(stageNo)
      .first<{ n: number }>();
    if ((existing?.n ?? 0) > 0) {
      return json(ctx.request, ctx.env, { ok: true, skipped: "empty" });
    }
  }

  const stmts: D1PreparedStatement[] = [];
  if (top10.length > 0) {
    stmts.push(
      ctx.env.DB.prepare(
        "DELETE FROM tdf_stage_results WHERE stage_no = ?"
      ).bind(stageNo)
    );
    for (const r of top10.slice(0, 10)) {
      stmts.push(
        ctx.env.DB.prepare(
          "INSERT INTO tdf_stage_results (stage_no, rider_id, rank) VALUES (?, ?, ?)"
        ).bind(stageNo, r.riderId, r.rank)
      );
    }
  }
  stmts.push(
    ctx.env.DB.prepare(
      `UPDATE tdf_stages SET status = 'finished',
         combative_rider_id = COALESCE(?, combative_rider_id),
         last_synced_at = ?
       WHERE stage_no = ?`
    ).bind(body.combativeId ?? null, new Date().toISOString(), stageNo)
  );
  await runD1Batch(ctx.env, stmts);

  await recalculateTdfStagePoints(ctx.env, stageNo);
  return json(ctx.request, ctx.env, { ok: true });
}

type FinalPayload = {
  yellow?: (string | null)[];
  white?: (string | null)[];
  green?: string | null;
  polka?: string | null;
};

export async function tdfAdminFinal(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const body = await parseJson<FinalPayload>(ctx.request);
  const y = (body.yellow ?? []).slice(0, 3) as (string | null)[];
  const w = (body.white ?? []).slice(0, 3) as (string | null)[];
  while (y.length < 3) y.push(null);
  while (w.length < 3) w.push(null);
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_grand_depart_results
       (id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       yellow1 = COALESCE(excluded.yellow1, yellow1),
       yellow2 = COALESCE(excluded.yellow2, yellow2),
       yellow3 = COALESCE(excluded.yellow3, yellow3),
       white1 = COALESCE(excluded.white1, white1),
       white2 = COALESCE(excluded.white2, white2),
       white3 = COALESCE(excluded.white3, white3),
       green = COALESCE(excluded.green, green),
       polka = COALESCE(excluded.polka, polka),
       updated_at = excluded.updated_at`
  )
    .bind(
      y[0],
      y[1],
      y[2],
      w[0],
      w[1],
      w[2],
      body.green ?? null,
      body.polka ?? null,
      new Date().toISOString()
    )
    .run();

  await recalculateTdfGrandDepart(ctx.env);
  return json(ctx.request, ctx.env, { ok: true });
}

// Recharge le peloton complet depuis letour (bouton admin). Remplace les coureurs
// d'exemple par le vrai peloton (nationalite + equipe).
export async function tdfAdminRefreshRoster(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const { loaded } = await refreshTdfPeloton(ctx.env);
  return json(ctx.request, ctx.env, { ok: true, loaded });
}

// Re-scrape les parcours d'etape depuis letour (profil + cols). Bouton admin.
export async function tdfAdminRefreshRoute(ctx: RequestContext): Promise<Response> {
  assertTdfSyncSecret(ctx);
  const { loaded } = await refreshTdfRoute(ctx.env);
  return json(ctx.request, ctx.env, { ok: true, loaded });
}
