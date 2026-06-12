import type { Env } from "./types";

// Cloudflare limite la taille d'un batch D1 ; on decoupe par securite.
const D1_BATCH_SIZE = 50;

// Execute des statements prepares en lots (un seul aller-retour reseau par lot)
// au lieu d'awaiter chaque ecriture sequentiellement.
//
// Indispensable pour la synchro : ~100 upserts de matchs + ~200 updates de
// recalcul awaites un par un depassaient le budget d'execution d'une invocation
// cron. La boucle d'upsert mourait alors en cours de route (matchs au statut
// `last_synced_at` decale) AVANT meme d'atteindre `recalculateAllPoints`, donc
// les points n'etaient jamais recalcules. En batchant, toute la synchro tient en
// une poignee de sous-requetes.
export async function runD1Batch(
  env: Env,
  statements: D1PreparedStatement[]
): Promise<void> {
  for (let i = 0; i < statements.length; i += D1_BATCH_SIZE) {
    const chunk = statements.slice(i, i + D1_BATCH_SIZE);
    if (chunk.length > 0) await env.DB.batch(chunk);
  }
}
