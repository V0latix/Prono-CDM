import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  errorResponse,
  HttpError,
  isAllowedOrigin,
  requireUser,
  type RequestContext
} from "./http";
import type { Env, User } from "./types";

function env(overrides: Partial<Env> = {}): Env {
  return overrides as Env;
}

function requestWithOrigin(origin?: string): Request {
  return new Request("https://prono-cdm-api.workers.dev/api/me", {
    headers: origin ? { origin } : {}
  });
}

describe("isAllowedOrigin", () => {
  it("autorise les origines explicitement configurées (liste séparée par des virgules)", () => {
    const allow = env({
      FRONTEND_ORIGIN: "https://prono.example.com, https://www.prono.example.com"
    });
    expect(isAllowedOrigin("https://prono.example.com", allow)).toBe(true);
    expect(isAllowedOrigin("https://www.prono.example.com", allow)).toBe(true);
  });

  it("autorise les sous-domaines de preview Vercel en https", () => {
    expect(isAllowedOrigin("https://prono-cdm-git-feature.vercel.app", env())).toBe(true);
    expect(isAllowedOrigin("https://prono-cdm.vercel.app", env())).toBe(true);
  });

  it("autorise les origines de dev local", () => {
    expect(isAllowedOrigin("http://localhost:5173", env())).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173", env())).toBe(true);
  });

  it("refuse une origine arbitraire même sans FRONTEND_ORIGIN configuré", () => {
    expect(isAllowedOrigin("https://attacker.example", env())).toBe(false);
  });

  it("refuse un faux domaine vercel non https ou en suffixe trompeur", () => {
    expect(isAllowedOrigin("http://prono.vercel.app", env())).toBe(false);
    expect(isAllowedOrigin("https://vercel.app.attacker.com", env())).toBe(false);
  });

  it("refuse une origine malformée", () => {
    expect(isAllowedOrigin("not-a-url", env())).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("ne reflète jamais une origine non autorisée", () => {
    const headers = corsHeaders(requestWithOrigin("https://attacker.example"), env()) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers.Vary).toBe("Origin");
  });

  it("reflète une origine de preview Vercel autorisée", () => {
    const headers = corsHeaders(
      requestWithOrigin("https://prono-cdm.vercel.app"),
      env()
    ) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://prono-cdm.vercel.app");
  });

  it("n'ajoute pas d'en-tête d'origine quand la requête n'a pas d'origine", () => {
    const headers = corsHeaders(requestWithOrigin(), env()) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("requireUser", () => {
  function context(user: User | null): RequestContext {
    return {
      request: requestWithOrigin(),
      env: env(),
      url: new URL("https://prono-cdm-api.workers.dev/api/me"),
      user
    };
  }

  it("renvoie l'utilisateur quand il est connecté", () => {
    const user: User = { id: "u1", pseudo: "Dems", created_at: "2026-06-05T00:00:00.000Z", is_admin: 0 };
    expect(requireUser(context(user))).toBe(user);
  });

  it("lève une 401 quand l'utilisateur est absent", () => {
    expect(() => requireUser(context(null))).toThrow(HttpError);
    try {
      requireUser(context(null));
    } catch (error) {
      expect((error as HttpError).status).toBe(401);
    }
  });
});

describe("errorResponse", () => {
  it("renvoie le statut et le message d'une HttpError", async () => {
    const response = errorResponse(requestWithOrigin(), env(), new HttpError(409, "Conflit"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Conflit" });
  });

  it("masque les erreurs inattendues derrière une 500 générique", async () => {
    const response = errorResponse(requestWithOrigin(), env(), new Error("boom interne"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Erreur serveur inattendue." });
  });
});
