import { describe, expect, it, vi } from "vitest";
import { api, resolveApiBase } from "./api";

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
});
