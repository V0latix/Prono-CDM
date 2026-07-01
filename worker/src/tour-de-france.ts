// Synchro Tour de France depuis letour.fr (site officiel), faite DIRECTEMENT par
// le Worker dans le cron existant. Contrairement a ProCyclingStats (qui bloque nos
// IP et n'a qu'une lib Python), letour.fr renvoie du HTML simple, accessible et
// parsable en TypeScript. C'est l'exception assumee a la regle "le Worker ne scrape
// jamais" : elle visait PCS. L'ecran admin manuel reste le filet de secours.
//
// Flux par etape : GET la page d'etape -> on lit les chemins AJAX par classement
// (extractAjaxRankingPaths) -> GET le fragment resultat (ite) + combativite (ice)
// -> upsert top 10 + combatif + statut, puis recalcul des points. Identite coureur
// = numero de dossard. Ecritures groupees via runD1Batch (budget cron).

import { runD1Batch } from "./d1-batch";
import {
  recalculateTdfGrandDepart,
  recalculateTdfStagePoints
} from "./tdf-scoring-db";
import {
  extractAjaxRankingPaths,
  parseCombativity,
  parseRankingTable,
  parseStageDetail,
  type LetourRankingRow
} from "../../src/shared/letour-parse";
import type { Env } from "./types";

const DEFAULT_BASE = "https://www.letour.fr";

type FetchLike = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

export type SyncDeps = { fetch?: FetchLike; now?: Date };

export type TdfSyncStatus = {
  status: "never_run" | "ok" | "error";
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSyncedStages: number;
};

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
    .bind(key, value)
    .run();
}

async function setStatus(
  env: Env,
  status: TdfSyncStatus["status"],
  values: { success?: string; error?: string; synced?: number } = {}
): Promise<void> {
  const writes = [setSetting(env, "tdf_sync_status", status)];
  if (values.success !== undefined) writes.push(setSetting(env, "tdf_last_success_at", values.success));
  if (values.error !== undefined) writes.push(setSetting(env, "tdf_last_error", values.error));
  if (values.synced !== undefined) writes.push(setSetting(env, "tdf_last_synced_stages", String(values.synced)));
  await Promise.all(writes);
}

export async function getTdfSyncStatus(env: Env): Promise<TdfSyncStatus> {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN
       ('tdf_sync_status','tdf_last_success_at','tdf_last_error','tdf_last_synced_stages')`
  ).all<{ key: string; value: string }>();
  const s = new Map((rows.results ?? []).map((r) => [r.key, r.value]));
  const synced = Number(s.get("tdf_last_synced_stages") ?? 0);
  return {
    status: (s.get("tdf_sync_status") as TdfSyncStatus["status"]) ?? "never_run",
    lastSuccessAt: s.get("tdf_last_success_at") || null,
    lastError: s.get("tdf_last_error") || null,
    lastSyncedStages: Number.isFinite(synced) ? synced : 0
  };
}

async function getText(fetchImpl: FetchLike, url: string): Promise<string | null> {
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  return res.text();
}

function riderUpserts(
  env: Env,
  rows: LetourRankingRow[],
  young: Set<string>
): D1PreparedStatement[] {
  // id = dossard. is_young ne redescend jamais a 0 (une fois jeune sur le Tour).
  return rows.map((r) =>
    env.DB.prepare(
      `INSERT INTO tdf_riders (id, name, team, nationality, is_young, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, team = excluded.team,
         nationality = COALESCE(excluded.nationality, nationality),
         is_young = CASE WHEN excluded.is_young = 1 THEN 1 ELSE is_young END`
    ).bind(r.bib, r.rider, r.team, r.nationality, young.has(r.bib) ? 1 : 0)
  );
}

async function youngBibs(
  env: Env,
  fetchImpl: FetchLike,
  base: string,
  ijgPath: string | undefined
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!ijgPath) return set;
  const html = await getText(fetchImpl, `${base}${ijgPath}`);
  if (html) for (const r of parseRankingTable(html)) set.add(r.bib);
  return set;
}

// Alimente le peloton depuis le classement general (itg) de la premiere etape,
// pour que les joueurs puissent pronostiquer. Best-effort.
// - force=false : ne charge que si le peloton est vide (bootstrap au fil de l'eau).
// - force=true  : recharge inconditionnellement (bouton admin / changement d'edition)
//   et purge les coureurs d'exemple (id non numerique) pour ne garder que le vrai
//   peloton keye par dossard. Renvoie le nombre de coureurs charges.
async function loadPeloton(
  env: Env,
  fetchImpl: FetchLike,
  base: string,
  options: { force?: boolean } = {}
): Promise<number> {
  if (!options.force) {
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tdf_riders"
    ).first<{ n: number }>();
    if ((count?.n ?? 0) > 0) return 0;
  }
  const first = await env.DB.prepare(
    "SELECT stage_no FROM tdf_stages ORDER BY stage_no ASC LIMIT 1"
  ).first<{ stage_no: number }>();
  if (!first) return 0;
  const page = await getText(fetchImpl, `${base}/en/rankings/stage-${first.stage_no}`);
  if (!page) return 0;
  const paths = extractAjaxRankingPaths(page);
  if (!paths.itg) return 0;
  const itg = await getText(fetchImpl, `${base}${paths.itg}`);
  const rows = itg ? parseRankingTable(itg) : [];
  if (!rows.length) return 0;
  const young = await youngBibs(env, fetchImpl, base, paths.ijg);

  const writes = riderUpserts(env, rows, young);
  if (options.force) {
    // Supprime les coureurs d'exemple (ids non numeriques) : le vrai peloton est
    // keye par dossard letour (numerique).
    writes.push(env.DB.prepare("DELETE FROM tdf_riders WHERE id NOT GLOB '[0-9]*'"));
  }
  await runD1Batch(env, writes);
  return rows.length;
}

// Recharge le peloton complet a la demande (bouton admin). Renvoie le nombre charge.
export async function refreshTdfPeloton(
  env: Env,
  deps: SyncDeps = {}
): Promise<{ loaded: number }> {
  const fetchImpl: FetchLike = deps.fetch ?? ((url) => fetch(url));
  const base = env.LETOUR_BASE_URL ?? DEFAULT_BASE;
  const loaded = await loadPeloton(env, fetchImpl, base, { force: true });
  return { loaded };
}

const TDF_STAGE_COUNT = 21;

// 13:00 Europe/Paris (CEST en juillet, UTC+2) => 11:00 UTC.
function defaultLockAt(date: string): string {
  return `${date}T11:00:00.000Z`;
}

// Scrape les pages /en/stage-N : profil officiel (image ASO) + cols catégorisés,
// et crée/complète au passage le calendrier (label/type/date). Best-effort.
// - force=false : ne traite que les étapes sans image de profil (paresseux, plafonné
//   par tick pour tenir le budget cron) ;
// - force=true  : re-scrape toutes les étapes (bouton admin).
// Anti-effacement : on ne remplace les cols d'une étape que si le parsing en a trouvé,
// et on n'écrase jamais un label/type/date réel par une valeur vide.
async function loadStageRoutes(
  env: Env,
  fetchImpl: FetchLike,
  base: string,
  options: { force?: boolean; max?: number } = {}
): Promise<number> {
  const force = options.force ?? false;
  const max = options.max ?? (force ? TDF_STAGE_COUNT : 3);

  const existing = await env.DB.prepare(
    "SELECT stage_no, profile_image_url AS img FROM tdf_stages"
  ).all<{ stage_no: number; img: string | null }>();
  const rows = existing.results ?? [];
  const existingNos = new Set(rows.map((r) => r.stage_no));
  const haveProfile = new Set(rows.filter((r) => r.img).map((r) => r.stage_no));

  let loaded = 0;
  for (let n = 1; n <= TDF_STAGE_COUNT && loaded < max; n += 1) {
    if (!force && haveProfile.has(n)) continue;

    const html = await getText(fetchImpl, `${base}/en/stage-${n}`);
    if (!html) continue;
    const detail = parseStageDetail(html);
    if (!detail.label && !detail.profileImageUrl && detail.cols.length === 0) continue;

    const writes: D1PreparedStatement[] = [];
    if (existingNos.has(n)) {
      writes.push(
        env.DB.prepare(
          `UPDATE tdf_stages SET
             date = COALESCE(?, date),
             type = CASE WHEN ? != '' THEN ? ELSE type END,
             label = CASE WHEN ? != '' THEN ? ELSE label END,
             profile_image_url = COALESCE(?, profile_image_url),
             cols_map_url = COALESCE(?, cols_map_url)
           WHERE stage_no = ?`
        ).bind(
          detail.date,
          detail.type,
          detail.type,
          detail.label,
          detail.label,
          detail.profileImageUrl,
          detail.colsMapUrl,
          n
        )
      );
    } else if (detail.date) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO tdf_stages (stage_no, date, lock_at, type, label, status, profile_image_url, cols_map_url)
           VALUES (?, ?, ?, ?, ?, 'upcoming', ?, ?)`
        ).bind(
          n,
          detail.date,
          defaultLockAt(detail.date),
          detail.type || "flat",
          detail.label,
          detail.profileImageUrl,
          detail.colsMapUrl
        )
      );
    } else {
      continue; // nouvelle étape sans date exploitable : on ne peut pas la créer
    }

    if (detail.cols.length) {
      writes.push(env.DB.prepare("DELETE FROM tdf_stage_cols WHERE stage_no = ?").bind(n));
      detail.cols.forEach((c, i) => {
        writes.push(
          env.DB.prepare(
            `INSERT INTO tdf_stage_cols (stage_no, position, kind, name, category, km)
             VALUES (?, ?, 'col', ?, ?, ?)`
          ).bind(n, i, c.name, c.category, c.km)
        );
      });
    }

    await runD1Batch(env, writes);
    loaded += 1;
  }
  return loaded;
}

// Re-scrape tous les parcours a la demande (bouton admin). Renvoie le nombre traite.
export async function refreshTdfRoute(
  env: Env,
  deps: SyncDeps = {}
): Promise<{ loaded: number }> {
  const fetchImpl: FetchLike = deps.fetch ?? ((url) => fetch(url));
  const base = env.LETOUR_BASE_URL ?? DEFAULT_BASE;
  const loaded = await loadStageRoutes(env, fetchImpl, base, { force: true });
  return { loaded };
}

// Classement letour -> maillot. Général (suffixe g) : itg=jaune, ipg=vert,
// img=pois, ijg=blanc (meilleur jeune).
const JERSEY_RANKINGS: ReadonlyArray<readonly [string, string]> = [
  ["itg", "yellow"],
  ["ipg", "green"],
  ["img", "polka"],
  ["ijg", "white"]
];

// Scrape le top N de chaque classement général et le stocke pour affichage.
// Anti-effacement : un classement vide (course pas commencée) n'écrase rien.
async function syncGeneralClassifications(
  env: Env,
  fetchImpl: FetchLike,
  base: string,
  paths: Record<string, string>,
  topN = 10
): Promise<void> {
  const writes: D1PreparedStatement[] = [];
  for (const [type, jersey] of JERSEY_RANKINGS) {
    const path = paths[type];
    if (!path) continue;
    const html = await getText(fetchImpl, `${base}${path}`);
    const rows = html ? parseRankingTable(html) : [];
    if (!rows.length) continue;
    writes.push(env.DB.prepare("DELETE FROM tdf_classifications WHERE jersey = ?").bind(jersey));
    rows.slice(0, topN).forEach((r) => {
      writes.push(
        env.DB.prepare(
          "INSERT INTO tdf_classifications (jersey, rank, rider_id) VALUES (?, ?, ?)"
        ).bind(jersey, r.rank, r.bib)
      );
    });
  }
  if (writes.length) await runD1Batch(env, writes);
}

async function syncFinalClassifications(
  env: Env,
  fetchImpl: FetchLike,
  base: string,
  paths: Record<string, string>,
  now: Date
): Promise<void> {
  const top3 = async (path: string | undefined): Promise<(string | null)[]> => {
    if (!path) return [null, null, null];
    const html = await getText(fetchImpl, `${base}${path}`);
    const rows = html ? parseRankingTable(html) : [];
    return [rows[0]?.bib ?? null, rows[1]?.bib ?? null, rows[2]?.bib ?? null];
  };
  const winner = async (path: string | undefined): Promise<string | null> =>
    (await top3(path))[0];

  const [yellow, white] = await Promise.all([top3(paths.itg), top3(paths.ijg)]);
  const [green, polka] = await Promise.all([winner(paths.ipg), winner(paths.img)]);

  await env.DB.prepare(
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
    .bind(yellow[0], yellow[1], yellow[2], white[0], white[1], white[2], green, polka, now.toISOString())
    .run();

  await recalculateTdfGrandDepart(env);
}

export async function syncTourDeFrance(env: Env, deps: SyncDeps = {}): Promise<{ error?: string }> {
  const fetchImpl: FetchLike = deps.fetch ?? ((url) => fetch(url));
  const now = deps.now ?? new Date();
  const base = env.LETOUR_BASE_URL ?? DEFAULT_BASE;

  try {
    // Calendrier + profils + cols : bootstrap complet (les étapes déjà munies d'un
    // profil sont sautées, donc c'est ~gratuit une fois le calendrier chargé).
    try {
      await loadStageRoutes(env, fetchImpl, base, { max: TDF_STAGE_COUNT });
    } catch {
      /* best-effort : ne fait pas échouer la synchro des résultats */
    }

    const stagesRes = await env.DB.prepare(
      "SELECT stage_no, date, status FROM tdf_stages ORDER BY stage_no ASC"
    ).all<{ stage_no: number; date: string; status: string }>();
    const stages = stagesRes.results ?? [];
    if (!stages.length) {
      await setStatus(env, "ok", { synced: 0, success: now.toISOString() });
      return {};
    }

    await loadPeloton(env, fetchImpl, base);

    const today = now.toISOString().slice(0, 10);
    const maxStage = Math.max(...stages.map((s) => s.stage_no));
    let synced = 0;

    for (const stage of stages) {
      if (stage.status === "finished") continue;
      if (stage.date > today) continue; // etape pas encore courue

      const page = await getText(fetchImpl, `${base}/en/rankings/stage-${stage.stage_no}`);
      if (!page) continue;
      const paths = extractAjaxRankingPaths(page);
      if (!paths.ite) continue;

      const iteHtml = await getText(fetchImpl, `${base}${paths.ite}`);
      const rows = iteHtml ? parseRankingTable(iteHtml) : [];
      if (!rows.length) continue; // anti-effacement : aucun resultat -> on ne touche rien

      const young = await youngBibs(env, fetchImpl, base, paths.ijg);
      let combative: string | null = null;
      if (paths.ice) {
        const iceHtml = await getText(fetchImpl, `${base}${paths.ice}`);
        if (iceHtml) combative = parseCombativity(iceHtml);
      }

      const top10 = rows.slice(0, 10);
      const writes: D1PreparedStatement[] = [
        ...riderUpserts(env, rows, young),
        env.DB.prepare("DELETE FROM tdf_stage_results WHERE stage_no = ?").bind(stage.stage_no),
        ...top10.map((r) =>
          env.DB.prepare(
            "INSERT INTO tdf_stage_results (stage_no, rider_id, rank) VALUES (?, ?, ?)"
          ).bind(stage.stage_no, r.bib, r.rank)
        ),
        env.DB.prepare(
          `UPDATE tdf_stages SET status = 'finished',
             combative_rider_id = COALESCE(?, combative_rider_id),
             last_synced_at = ? WHERE stage_no = ?`
        ).bind(combative, now.toISOString(), stage.stage_no)
      ];
      await runD1Batch(env, writes);
      await recalculateTdfStagePoints(env, stage.stage_no);
      synced += 1;

      if (stage.stage_no === maxStage) {
        await syncFinalClassifications(env, fetchImpl, base, paths, now);
      }
    }

    // Classements généraux par maillot (best-effort), depuis la dernière étape courue.
    try {
      const raced = stages.filter((s) => s.date <= today);
      const latest = raced[raced.length - 1];
      if (latest) {
        const page = await getText(fetchImpl, `${base}/en/rankings/stage-${latest.stage_no}`);
        const paths = page ? extractAjaxRankingPaths(page) : {};
        await syncGeneralClassifications(env, fetchImpl, base, paths);
      }
    } catch {
      /* best-effort : n'échoue pas la synchro */
    }

    await setStatus(env, "ok", { synced, success: now.toISOString() });
    return {};
  } catch (error) {
    await setStatus(env, "error", { error: String(error) });
    return { error: String(error) };
  }
}
