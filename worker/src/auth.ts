import type { Env, User } from "./types";

const SESSION_COOKIE = "pcdm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PIN_HASH_SCHEME = "sha256";

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...view].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function normalizePseudo(pseudo: string): string {
  return pseudo.trim().replace(/\s+/g, " ");
}

export function validatePin(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("Le PIN doit contenir 4 à 8 chiffres.");
  }
}

export async function hashPin(pin: string): Promise<string> {
  validatePin(pin);
  const saltHex = randomHex(16);
  const hashHex = await sha256Hex(`${saltHex}:${pin}`);
  return `${PIN_HASH_SCHEME}$${saltHex}$${hashHex}`;
}

async function verifyPbkdf2Pin(
  pin: string,
  iterations: string,
  saltHex: string,
  hashHex: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations: Number(iterations)
    },
    key,
    256
  );

  return constantTimeEqual(bytesToHex(bits), hashHex);
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [scheme, first, second, third] = storedHash.split("$");

  if (scheme === PIN_HASH_SCHEME && first && second) {
    return constantTimeEqual(await sha256Hex(`${first}:${pin}`), second);
  }

  if (scheme === "pbkdf2" && first && second && third) {
    return verifyPbkdf2Pin(pin, first, second, third);
  }

  return false;
}

export async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  );
}

export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("cookie");
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key) cookies.set(key, decodeURIComponent(value.join("=")));
  }

  return cookies;
}

export function serializeSessionCookie(
  request: Request,
  env: Env,
  token: string,
  maxAgeSeconds = SESSION_TTL_SECONDS
): string {
  const sameSite = env.COOKIE_SAMESITE ?? "Lax";
  const secure =
    env.COOKIE_SECURE === "true" ||
    sameSite === "None" ||
    (env.COOKIE_SECURE !== "false" && new URL(request.url).protocol === "https:");
  const pieces = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    `SameSite=${sameSite}`
  ];
  if (secure) pieces.push("Secure");
  return pieces.join("; ");
}

export function clearSessionCookie(request: Request, env: Env): string {
  return serializeSessionCookie(request, env, "", 0);
}

export async function createSession(
  env: Env,
  userId: string
): Promise<string> {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt)
    .run();

  return token;
}

export async function getUserFromSession(
  request: Request,
  env: Env
): Promise<User | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const user = await env.DB.prepare(
    `SELECT users.id, users.pseudo, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?
     LIMIT 1`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<User>();

  return user ?? null;
}

export async function deleteCurrentSession(
  request: Request,
  env: Env
): Promise<void> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}
