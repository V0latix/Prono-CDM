import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  DUMMY_PIN_HASH,
  getUserFromSession,
  hashPin,
  isLoginLocked,
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_ATTEMPT_WINDOW_MS,
  nextFailedLoginAttempt,
  normalizePseudo,
  normalizePseudoKey,
  purgeExpiredSessions,
  serializeSessionCookie,
  validatePin,
  verifyPin
} from "./auth";
import type { Env } from "./types";

function env(overrides: Partial<Env> = {}): Env {
  return overrides as Env;
}

describe("auth constraints", () => {
  it("normalizes pseudo whitespace without changing casing", () => {
    expect(normalizePseudo("  Romain   Desm  ")).toBe("Romain Desm");
  });

  it("builds a case-insensitive pseudo key for account lookup", () => {
    expect(normalizePseudoKey("  CloVis   ")).toBe("clovis");
    expect(normalizePseudoKey("DEMS")).toBe("dems");
  });

  it("accepts only numeric PINs with 4 to 8 digits", () => {
    expect(() => validatePin("1234")).not.toThrow();
    expect(() => validatePin("12345678")).not.toThrow();
    expect(() => validatePin("123")).toThrow("Le PIN doit contenir 4 à 8 chiffres.");
    expect(() => validatePin("123456789")).toThrow();
    expect(() => validatePin("12ab")).toThrow();
  });

  it("hashes PINs with a salt and verifies only the matching PIN", async () => {
    const firstHash = await hashPin("1234");
    const secondHash = await hashPin("1234");

    expect(firstHash).toMatch(/^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(secondHash).not.toBe(firstHash);
    expect(await verifyPin("1234", firstHash)).toBe(true);
    expect(await verifyPin("4321", firstHash)).toBe(false);
  });

  it("keeps backward compatibility with existing PBKDF2 hashes", async () => {
    const saltHex = "00112233445566778899aabbccddeeff";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("2468"),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: Uint8Array.from(saltHex.match(/../g)!.map((byte) => Number.parseInt(byte, 16))),
        iterations: 10
      },
      key,
      256
    );
    const hashHex = [...new Uint8Array(bits)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifyPin("2468", `pbkdf2$10$${saltHex}$${hashHex}`)).toBe(true);
    expect(await verifyPin("1357", `pbkdf2$10$${saltHex}$${hashHex}`)).toBe(false);
  });

  it("locks login after repeated failed PIN attempts in the active window", () => {
    const nowMs = Date.parse("2026-06-04T12:00:00.000Z");
    const windowStartedAt = new Date(nowMs - 60_000).toISOString();
    const nextAttempt = nextFailedLoginAttempt(
      {
        failed_attempts: LOGIN_MAX_FAILED_ATTEMPTS - 1,
        window_started_at: windowStartedAt,
        locked_until: null
      },
      nowMs
    );

    expect(nextAttempt.failedAttempts).toBe(LOGIN_MAX_FAILED_ATTEMPTS);
    expect(nextAttempt.windowStartedAt).toBe(windowStartedAt);
    expect(nextAttempt.lockedUntil).toBe(new Date(nowMs + LOGIN_LOCK_MS).toISOString());
    expect(
      isLoginLocked(
        {
          failed_attempts: nextAttempt.failedAttempts,
          window_started_at: nextAttempt.windowStartedAt,
          locked_until: nextAttempt.lockedUntil
        },
        nowMs
      )
    ).toBe(true);
  });

  it("starts a new failed PIN window after the previous window expires", () => {
    const nowMs = Date.parse("2026-06-04T12:00:00.000Z");
    const nextAttempt = nextFailedLoginAttempt(
      {
        failed_attempts: LOGIN_MAX_FAILED_ATTEMPTS - 1,
        window_started_at: new Date(nowMs - LOGIN_ATTEMPT_WINDOW_MS - 1).toISOString(),
        locked_until: null
      },
      nowMs
    );

    expect(nextAttempt.failedAttempts).toBe(1);
    expect(nextAttempt.windowStartedAt).toBe(new Date(nowMs).toISOString());
    expect(nextAttempt.lockedUntil).toBeNull();
  });

  it("treats expired login locks as open again", () => {
    const nowMs = Date.parse("2026-06-04T12:00:00.000Z");

    expect(
      isLoginLocked(
        {
          failed_attempts: LOGIN_MAX_FAILED_ATTEMPTS,
          window_started_at: new Date(nowMs - 60_000).toISOString(),
          locked_until: new Date(nowMs - 1).toISOString()
        },
        nowMs
      )
    ).toBe(false);
  });

  it("serializes secure cross-domain session cookies", () => {
    const request = new Request("https://api.example.test/api/auth/register");
    const cookie = serializeSessionCookie(
      request,
      env({ COOKIE_SAMESITE: "None", COOKIE_SECURE: "true" }),
      "abc123"
    );

    expect(cookie).toContain("pcdm_session=abc123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("clears the session cookie with Max-Age=0", () => {
    const cookie = clearSessionCookie(
      new Request("https://api.example.test/api/auth/logout"),
      env({ COOKIE_SAMESITE: "None", COOKIE_SECURE: "true" })
    );

    expect(cookie).toContain("pcdm_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });

  it("never matches a real PIN against the dummy hash used for unknown accounts", async () => {
    expect(await verifyPin("1234", DUMMY_PIN_HASH)).toBe(false);
    expect(await verifyPin("00000000", DUMMY_PIN_HASH)).toBe(false);
  });

  it("purges only expired sessions using the current timestamp", async () => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return this;
          },
          async run() {
            return { meta: { changes: 1 } };
          }
        };
      }
    };

    await purgeExpiredSessions(env({ DB: db as unknown as D1Database }));

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("DELETE FROM sessions WHERE expires_at <=");
    expect(typeof calls[0].args[0]).toBe("string");
    expect(Number.isFinite(Date.parse(calls[0].args[0] as string))).toBe(true);
  });

  it("accepts bearer session tokens when cookies are unavailable", async () => {
    const request = new Request("https://api.example.test/api/dashboard", {
      headers: {
        authorization: "Bearer preview-token"
      }
    });
    const db = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return {
              id: "user-1",
              pseudo: "Dems",
              created_at: "2026-06-05T12:00:00.000Z"
            };
          }
        };
      }
    };

    await expect(getUserFromSession(request, env({ DB: db as unknown as D1Database }))).resolves.toMatchObject({
      id: "user-1",
      pseudo: "Dems"
    });
  });
});
