import { describe, expect, it, vi } from "vitest";
import { api, resolveApiBase, setApiSessionToken, SESSION_EXPIRED_EVENT } from "./api";

const SESSION_TOKEN_KEY = "prono-cdm-session-token";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("api client", () => {
  it("sends JSON requests with credentials included", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api<{ ok: boolean }>("/api/test", {
        method: "POST",
        body: JSON.stringify({ hello: "world" })
      })
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json"
        })
      })
    );
  });

  it("surfaces server JSON errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Ce match est verrouillé." }), {
          status: 409,
          headers: { "content-type": "application/json" }
        })
      )
    );

    await expect(api("/api/predictions/match-1")).rejects.toThrow(
      "Ce match est verrouillé."
    );
  });

  it("uses a generic message when the server response has no JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Nope", { status: 500 }))
    );

    await expect(api("/api/broken")).rejects.toThrow("Erreur réseau ou serveur.");
  });

  it("resolves the Worker API directly from Vercel previews instead of protected preview rewrites", () => {
    expect(resolveApiBase("preview-prono.vercel.app", "")).toBe(
      "https://prono-cdm-api.volatix-prono-cdm.workers.dev"
    );
    expect(resolveApiBase("localhost", "")).toBe("");
    expect(resolveApiBase("preview-prono.vercel.app", "https://api.example.test")).toBe(
      "https://api.example.test"
    );
  });

  it("calls the configured API base when one is resolved", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        credentials: "include"
      })
    );
  });

  it("adds a bearer token when the preview session fallback is stored", async () => {
    setApiSessionToken("preview-token", true);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/dashboard");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer preview-token"
        })
      })
    );
  });

  it("persists the session token in localStorage so it survives a browser restart", () => {
    setApiSessionToken("persisted-token", true);
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBe("persisted-token");
    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    setApiSessionToken(null);
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });

  it("clears the token and signals expiry on a 401 from an authed route", async () => {
    setApiSessionToken("stale-token", true);
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Connexion requise." }, 401)));

    await expect(api("/api/dashboard")).rejects.toThrow("Connexion requise.");

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it("does not treat a 401 from the auth endpoints as a session expiry", async () => {
    setApiSessionToken("keep-token", true);
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Pseudo ou PIN incorrect." }, 401))
    );

    await expect(
      api("/api/auth/login", { method: "POST", body: "{}" })
    ).rejects.toThrow("Pseudo ou PIN incorrect.");

    expect(onExpired).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBe("keep-token");
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    setApiSessionToken(null);
  });
});
