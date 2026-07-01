import { HttpError, json, parseJson, requireUser, type RequestContext } from "./http";
import type { TdfRiderRow, TdfStageRow } from "./types";

type StagePredictionPayload = { riderIds?: string[]; combativeId?: string | null };

async function activeRiderIds(ctx: RequestContext): Promise<Set<string>> {
  const rows = await ctx.env.DB.prepare(
    "SELECT id FROM tdf_riders WHERE status = 'active'"
  ).all<{ id: string }>();
  return new Set((rows.results ?? []).map((r) => r.id));
}

export async function tdfRiders(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    "SELECT id, name, team, nationality, is_young, status FROM tdf_riders WHERE status='active' ORDER BY name ASC"
  ).all<TdfRiderRow>();
  return json(ctx.request, ctx.env, { riders: rows.results ?? [] });
}

export async function tdfStages(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const [stagesRes, colsRes] = await Promise.all([
    ctx.env.DB.prepare("SELECT * FROM tdf_stages ORDER BY stage_no ASC").all<TdfStageRow>(),
    ctx.env.DB.prepare(
      "SELECT stage_no, kind, name, category, km FROM tdf_stage_cols ORDER BY stage_no ASC, position ASC"
    ).all<{ stage_no: number; kind: string; name: string; category: string | null; km: number | null }>()
  ]);
  const colsByStage = new Map<number, { kind: string; name: string; category: string | null; km: number | null }[]>();
  for (const c of colsRes.results ?? []) {
    const list = colsByStage.get(c.stage_no) ?? [];
    list.push({ kind: c.kind, name: c.name, category: c.category, km: c.km });
    colsByStage.set(c.stage_no, list);
  }
  const stages = (stagesRes.results ?? []).map((s) => ({
    ...s,
    cols: colsByStage.get(s.stage_no) ?? []
  }));
  return json(ctx.request, ctx.env, { stages });
}

export async function tdfSaveStagePrediction(
  ctx: RequestContext,
  stageNo: number
): Promise<Response> {
  const user = requireUser(ctx);
  const stage = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages WHERE stage_no = ?"
  )
    .bind(stageNo)
    .first<TdfStageRow>();
  if (!stage) throw new HttpError(404, "Étape introuvable.");
  if (new Date(stage.lock_at).getTime() <= Date.now()) {
    throw new HttpError(409, "Cette étape est verrouillée depuis le départ.");
  }

  const body = await parseJson<StagePredictionPayload>(ctx.request);
  const riderIds = Array.isArray(body.riderIds) ? body.riderIds : [];
  if (riderIds.length !== 10) {
    throw new HttpError(400, "Choisis exactement 10 coureurs.");
  }
  if (new Set(riderIds).size !== 10) {
    throw new HttpError(400, "Les 10 coureurs doivent être distincts.");
  }
  const active = await activeRiderIds(ctx);
  for (const id of riderIds) {
    if (!active.has(id)) throw new HttpError(400, "Coureur inconnu dans le peloton.");
  }
  const combativeId = body.combativeId ?? null;
  if (combativeId && !active.has(combativeId)) {
    throw new HttpError(400, "Coureur combatif inconnu dans le peloton.");
  }

  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_stage_predictions (user_id, stage_no, rider_ids, combative_rider_id, points, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id, stage_no) DO UPDATE SET
       rider_ids = excluded.rider_ids,
       combative_rider_id = excluded.combative_rider_id,
       updated_at = excluded.updated_at`
  )
    .bind(user.id, stageNo, JSON.stringify(riderIds), combativeId, now, now)
    .run();

  return json(ctx.request, ctx.env, { ok: true });
}

export async function tdfSaveGrandDepart(ctx: RequestContext): Promise<Response> {
  const user = requireUser(ctx);
  const firstStage = await ctx.env.DB.prepare(
    "SELECT lock_at FROM tdf_stages WHERE stage_no = 1"
  ).first<{ lock_at: string }>();
  // ponytail: absence de l'étape 1 signifie que le calendrier n'est pas encore
  // chargé (synchro en attente). Dans ce cas le grand départ est traité comme
  // ouvert : dès que la synchro tourne, l'étape 1 existe et le verrou s'applique.
  if (firstStage && new Date(firstStage.lock_at).getTime() <= Date.now()) {
    throw new HttpError(409, "Le grand départ est verrouillé.");
  }

  type Payload = {
    yellow?: (string | null)[];
    white?: (string | null)[];
    green?: string | null;
    polka?: string | null;
  };
  const body = await parseJson<Payload>(ctx.request);
  const active = await activeRiderIds(ctx);

  const podium = (arr: (string | null)[] | undefined, label: string): (string | null)[] => {
    if ((arr ?? []).length > 3) {
      throw new HttpError(400, `Le podium ${label} ne peut contenir que 3 coureurs.`);
    }
    const p = (arr ?? []).slice(0, 3);
    while (p.length < 3) p.push(null);
    const filled = p.filter(Boolean) as string[];
    if (new Set(filled).size !== filled.length) {
      throw new HttpError(400, `Coureurs en double dans le podium ${label}.`);
    }
    for (const id of filled) {
      if (!active.has(id)) throw new HttpError(400, `Coureur inconnu (podium ${label}).`);
    }
    return p;
  };

  const yellow = podium(body.yellow, "jaune");
  const white = podium(body.white, "blanc");
  const green = body.green ?? null;
  const polka = body.polka ?? null;
  for (const id of [green, polka].filter(Boolean) as string[]) {
    if (!active.has(id)) throw new HttpError(400, "Coureur inconnu (maillot).");
  }

  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO tdf_grand_depart_predictions
       (user_id, yellow1, yellow2, yellow3, white1, white2, white3, green, polka, points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       yellow1 = excluded.yellow1, yellow2 = excluded.yellow2, yellow3 = excluded.yellow3,
       white1 = excluded.white1, white2 = excluded.white2, white3 = excluded.white3,
       green = excluded.green, polka = excluded.polka, updated_at = excluded.updated_at`
  )
    .bind(
      user.id,
      yellow[0],
      yellow[1],
      yellow[2],
      white[0],
      white[1],
      white[2],
      green,
      polka,
      now,
      now
    )
    .run();

  return json(ctx.request, ctx.env, { ok: true });
}

export async function tdfLeaderboard(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT users.id AS user_id, users.pseudo,
            COALESCE(s.pts, 0) + COALESCE(gd.points, 0) AS points,
            COALESCE(s.pts, 0) AS stage_points,
            COALESCE(gd.points, 0) AS grand_depart_points,
            COALESCE(s.played, 0) AS stages_played,
            COALESCE(s.best, 0) AS best_stage
     FROM users
     LEFT JOIN (SELECT user_id, SUM(points) AS pts, COUNT(*) AS played, MAX(points) AS best
                FROM tdf_stage_predictions GROUP BY user_id) s
       ON s.user_id = users.id
     LEFT JOIN tdf_grand_depart_predictions gd ON gd.user_id = users.id
     WHERE s.user_id IS NOT NULL OR gd.user_id IS NOT NULL
     ORDER BY points DESC, users.pseudo ASC`
  ).all<{
    user_id: string;
    pseudo: string;
    points: number;
    stage_points: number;
    grand_depart_points: number;
    stages_played: number;
    best_stage: number;
  }>();
  return json(ctx.request, ctx.env, { leaderboard: rows.results ?? [] });
}

export async function tdfDashboard(ctx: RequestContext): Promise<Response> {
  const user = requireUser(ctx);
  const next = await ctx.env.DB.prepare(
    "SELECT * FROM tdf_stages WHERE lock_at > ? ORDER BY stage_no ASC LIMIT 1"
  )
    .bind(new Date().toISOString())
    .first<TdfStageRow>();
  const mine = next
    ? await ctx.env.DB.prepare(
        "SELECT rider_ids, combative_rider_id FROM tdf_stage_predictions WHERE user_id = ? AND stage_no = ?"
      )
        .bind(user.id, next.stage_no)
        .first()
    : null;
  return json(ctx.request, ctx.env, { nextStage: next ?? null, myPrediction: mine ?? null });
}

export async function tdfResults(ctx: RequestContext): Promise<Response> {
  requireUser(ctx);
  const [stages, results, cls] = await Promise.all([
    ctx.env.DB.prepare(
      "SELECT * FROM tdf_stages WHERE status = 'finished' ORDER BY stage_no DESC"
    ).all<TdfStageRow>(),
    ctx.env.DB.prepare(
      "SELECT stage_no, rider_id, rank FROM tdf_stage_results ORDER BY stage_no DESC, rank ASC"
    ).all<{ stage_no: number; rider_id: string; rank: number }>(),
    ctx.env.DB.prepare(
      "SELECT jersey, rank, rider_id FROM tdf_classifications ORDER BY jersey ASC, rank ASC"
    ).all<{ jersey: string; rank: number; rider_id: string }>()
  ]);
  const classifications: Record<string, { rank: number; rider_id: string }[]> = {};
  for (const c of cls.results ?? []) {
    (classifications[c.jersey] ??= []).push({ rank: c.rank, rider_id: c.rider_id });
  }
  return json(ctx.request, ctx.env, {
    stages: stages.results ?? [],
    results: results.results ?? [],
    classifications
  });
}
