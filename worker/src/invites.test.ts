import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
  shouldThrottleSync,
  SYNC_MIN_INTERVAL_MS
} from "./invites";

describe("generateInviteCode", () => {
  it("génère un code de 6 caractères dans l'alphabet sans ambiguïté", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("évite les caractères ambigus (0, O, 1, I)", () => {
    const randomBytes = () => Uint8Array.from([0, 1, 2, 3, 4, 5]);
    const code = generateInviteCode(randomBytes);
    expect(code).not.toMatch(/[01OI]/);
  });
});

describe("normalizeInviteCode", () => {
  it("met en majuscules et retire séparateurs et espaces", () => {
    expect(normalizeInviteCode("  abc-2 3d ")).toBe("ABC23D");
  });

  it("rejette un code invalide après normalisation", () => {
    expect(isValidInviteCode(normalizeInviteCode("abc"))).toBe(false);
    expect(isValidInviteCode(normalizeInviteCode("ABCDE1"))).toBe(false); // 1 hors alphabet
  });
});

describe("shouldThrottleSync", () => {
  const nowMs = Date.parse("2026-06-06T12:00:00.000Z");

  it("ignore les synchros déclenchées pendant qu'une autre tourne", () => {
    expect(shouldThrottleSync({ status: "running", lastStartedAt: null }, nowMs)).toBe(true);
  });

  it("ignore une synchro relancée juste après la précédente", () => {
    const startedAt = new Date(nowMs - 5_000).toISOString();
    expect(shouldThrottleSync({ status: "success", lastStartedAt: startedAt }, nowMs)).toBe(true);
  });

  it("autorise une synchro après l'intervalle minimal", () => {
    const startedAt = new Date(nowMs - SYNC_MIN_INTERVAL_MS - 1).toISOString();
    expect(shouldThrottleSync({ status: "success", lastStartedAt: startedAt }, nowMs)).toBe(false);
  });

  it("autorise la première synchro quand aucune n'a encore eu lieu", () => {
    expect(shouldThrottleSync({ status: "never_run", lastStartedAt: null }, nowMs)).toBe(false);
  });
});
