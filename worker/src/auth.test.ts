import { describe, expect, it } from "vitest";
import {
  clearSessionCookie,
  hashPin,
  normalizePseudo,
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
});
