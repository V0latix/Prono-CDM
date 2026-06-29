import { describe, expect, it } from "vitest";
import { errorResponse, HttpError, type RequestContext } from "./http";
import { getWorkerErrorStatus, recordWorkerError } from "./monitoring";
import { parseMatchPagination, route } from "./routes";
import { createMemoryDb } from "./test-db";
import type { User } from "./types";

const fakeUser: User = { id: "u1", pseudo: "Dede", created_at: "2026-06-16", is_admin: 0 };

describe("parseMatchPagination", () => {
  it("renvoie null sans parametre (comportement historique : tout le calendrier)", () => {
    expect(parseMatchPagination(new URLSearchParams(""))).toBeNull();
  });

  it("accepte limit et offset valides", () => {
    expect(parseMatchPagination(new URLSearchParams("limit=10&offset=20"))).toEqual({
      limit: 10,
      offset: 20
    });
  });

  it("offset par defaut a 0 si seul limit est fourni", () => {
    expect(parseMatchPagination(new URLSearchParams("limit=5"))).toEqual({
      limit: 5,
      offset: 0
    });
  });

  it("exige limit si offset est fourni seul", () => {
    expect(() => parseMatchPagination(new URLSearchParams("offset=5"))).toThrow(HttpError);
  });

  it.each(["limit=0", "limit=201", "limit=2.5", "limit=abc"])(
    "refuse un limit invalide (%s)",
    (query) => {
      expect(() => parseMatchPagination(new URLSearchParams(query))).toThrow(HttpError);
    }
  );

  it("refuse un offset negatif", () => {
    expect(() => parseMatchPagination(new URLSearchParams("limit=5&offset=-1"))).toThrow(
      HttpError
    );
  });
});

describe("cache de /api/health", () => {
  it("autorise un cache court sur le seul endpoint public", async () => {
    const memory = createMemoryDb();
    const request = new Request("https://api.test/api/health", { method: "GET" });
    const ctx: RequestContext = {
      request,
      env: memory.env,
      url: new URL(request.url),
      user: null
    };
    const response = await route(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});

describe("surveillance des erreurs Worker", () => {
  it("compte les erreurs et retient la derniere", async () => {
    const memory = createMemoryDb();
    expect(await getWorkerErrorStatus(memory.env)).toEqual({
      count: 0,
      lastError: null,
      lastErrorAt: null
    });

    await recordWorkerError(memory.env, new Error("boom 1"));
    await recordWorkerError(memory.env, new Error("boom 2"));

    const status = await getWorkerErrorStatus(memory.env);
    expect(status.count).toBe(2);
    expect(status.lastError).toBe("boom 2");
    expect(status.lastErrorAt).toBeTruthy();
  });

  it("errorResponse journalise les 500 (best-effort) sans relancer", async () => {
    const memory = createMemoryDb();
    const request = new Request("https://api.test/api/whatever", { method: "GET" });
    const response = errorResponse(request, memory.env, new Error("crash"));
    expect(response.status).toBe(500);

    // L'ecriture est fire-and-forget : on laisse les microtaches se vider.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await getWorkerErrorStatus(memory.env);
    expect(status.count).toBe(1);
    expect(status.lastError).toBe("crash");
  });

  it("n'enregistre pas les HttpError (4xx attendus)", async () => {
    const memory = createMemoryDb();
    const request = new Request("https://api.test/api/whatever", { method: "GET" });
    const response = errorResponse(request, memory.env, new HttpError(404, "introuvable"));
    expect(response.status).toBe(404);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await getWorkerErrorStatus(memory.env)).count).toBe(0);
  });

  it("expose le statut d'erreurs via /api/sync/status", async () => {
    const memory = createMemoryDb();
    await recordWorkerError(memory.env, new Error("oops"));
    const request = new Request("https://api.test/api/sync/status", { method: "GET" });
    const ctx: RequestContext = {
      request,
      env: memory.env,
      url: new URL(request.url),
      user: fakeUser
    };
    const response = await route(ctx);
    const body = (await response.json()) as { errors: { count: number; lastError: string } };
    expect(body.errors.count).toBe(1);
    expect(body.errors.lastError).toBe("oops");
  });
});
