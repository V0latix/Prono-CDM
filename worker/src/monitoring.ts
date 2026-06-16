import type { Env } from "./types";

// Surveillance minimale des erreurs Worker. On persiste dans la table `settings`
// le nombre cumule d'erreurs serveur (500) et la derniere rencontree, consultables
// via /api/sync/status. C'est volontairement leger : pas de service externe, juste
// de quoi reperer qu'une route casse en prod sans fouiller les logs Cloudflare.

export type WorkerErrorStatus = {
  count: number;
  lastError: string | null;
  lastErrorAt: string | null;
};

const COUNT_KEY = "worker_error_count";
const MESSAGE_KEY = "worker_last_error";
const AT_KEY = "worker_last_error_at";

// Best-effort : enregistrer l'erreur ne doit jamais relancer (sinon on masquerait
// l'erreur d'origine renvoyee a l'utilisateur). Tout echec d'ecriture est avale.
export async function recordWorkerError(env: Env, error: unknown): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const current = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = ? LIMIT 1"
    )
      .bind(COUNT_KEY)
      .first<{ value: string }>();
    const parsed = Number(current?.value ?? 0);
    const nextCount = (Number.isFinite(parsed) ? parsed : 0) + 1;

    const entries: Array<[string, string]> = [
      [COUNT_KEY, String(nextCount)],
      [MESSAGE_KEY, message.slice(0, 500)],
      [AT_KEY, new Date().toISOString()]
    ];
    for (const [key, value] of entries) {
      await env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
        .bind(key, value)
        .run();
    }
  } catch (writeError) {
    console.error("recordWorkerError a echoue", writeError);
  }
}

export async function getWorkerErrorStatus(env: Env): Promise<WorkerErrorStatus> {
  const rows = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN (?, ?, ?)"
  )
    .bind(COUNT_KEY, MESSAGE_KEY, AT_KEY)
    .all<{ key: string; value: string }>();
  const settings = new Map((rows.results ?? []).map((row) => [row.key, row.value]));
  const rawCount = Number(settings.get(COUNT_KEY) ?? 0);

  return {
    count: Number.isFinite(rawCount) ? rawCount : 0,
    lastError: settings.get(MESSAGE_KEY) || null,
    lastErrorAt: settings.get(AT_KEY) || null
  };
}
