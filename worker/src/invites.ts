import type { SyncStatus } from "./football-data";

// Alphabet sans caractères ambigus (pas de 0/O/1/I) pour un code lisible/partageable.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

export function generateInviteCode(
  randomBytes: (length: number) => Uint8Array = defaultRandomBytes
): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_ALPHABET[bytes[index] % INVITE_ALPHABET.length];
  }
  return code;
}

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Normalise un code saisi par l'utilisateur : on retire espaces, tirets et
 * autres séparateurs, et on passe en majuscules.
 */
export function normalizeInviteCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function isValidInviteCode(value: string): boolean {
  return new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`).test(value);
}

export const SYNC_MIN_INTERVAL_MS = 30_000;

/**
 * Décide si une synchro déclenchée par un utilisateur doit être ignorée parce
 * qu'une synchro vient juste d'avoir lieu (protection du quota football-data).
 */
export function shouldThrottleSync(
  status: Pick<SyncStatus, "status" | "lastStartedAt">,
  nowMs = Date.now(),
  minIntervalMs = SYNC_MIN_INTERVAL_MS
): boolean {
  if (status.status === "running") return true;
  if (!status.lastStartedAt) return false;
  const startedMs = Date.parse(status.lastStartedAt);
  if (!Number.isFinite(startedMs)) return false;
  return nowMs - startedMs < minIntervalMs;
}
