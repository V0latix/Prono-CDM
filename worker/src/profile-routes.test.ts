import { beforeEach, describe, expect, it } from "vitest";
import { getUserFromSession } from "./auth";
import { errorResponse, type RequestContext } from "./http";
import { route } from "./routes";
import { createMemoryDb, type MemoryDb } from "./test-db";

// Tests des routes profil : GET /api/profile, PUT /api/profile (validation des
// entrees, dont photo invalide / trop lourde) et garde d'authentification de la
// route profil publique. Le mode lenient evite de modeliser tout le fan-out de
// lectures annexes (badges, groupes) : on cible la logique propre a la route.

async function call(
  memory: MemoryDb,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const request = new Request(`https://api.test${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const ctx: RequestContext = {
    request,
    env: memory.env,
    url: new URL(request.url),
    user: await getUserFromSession(request, memory.env)
  };
  let response: Response;
  try {
    response = await route(ctx);
  } catch (error) {
    response = errorResponse(request, memory.env, error);
  }
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

describe("routes profil", () => {
  let memory: MemoryDb;
  let token: string;

  beforeEach(async () => {
    memory = createMemoryDb({}, { lenient: true });
    const register = await call(memory, "POST", "/api/auth/register", {
      body: { pseudo: "Dede", pin: "1234" }
    });
    token = register.body.sessionToken as string;
  });

  describe("PUT /api/profile", () => {
    it("enregistre un profil valide (URL ou data image)", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: {
          photoUrl: "https://example.com/avatar.png",
          tagline: "Allez les Bleus",
          favoriteTeam: "France"
        }
      });

      expect(result.status).toBe(200);
      expect(result.body.profile).toMatchObject({
        photoUrl: "https://example.com/avatar.png",
        tagline: "Allez les Bleus",
        favoriteTeam: "France"
      });
      expect(memory.tables.user_profiles).toHaveLength(1);
      expect(memory.tables.user_profiles[0]).toMatchObject({
        favorite_team: "France"
      });
    });

    it("accepte une data URL image valide", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" }
      });
      expect(result.status).toBe(200);
    });

    it("refuse une photo au format non image", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: "ftp://exemple/pas-une-image" }
      });
      expect(result.status).toBe(400);
      expect(memory.tables.user_profiles).toHaveLength(0);
    });

    it("refuse une data URL d'un type non image", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: "data:text/html;base64,PHNjcmlwdD4=" }
      });
      expect(result.status).toBe(400);
    });

    it("refuse une photo trop lourde (au-dela du plafond serveur)", async () => {
      const tooHeavy = "data:image/png;base64," + "A".repeat(1_000_001);
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: tooHeavy }
      });
      expect(result.status).toBe(400);
      expect(memory.tables.user_profiles).toHaveLength(0);
    });

    it("refuse une photo qui n'est pas du texte", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: 42 }
      });
      expect(result.status).toBe(400);
    });

    it("refuse une phrase d'accroche trop longue", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: "", tagline: "x".repeat(91) }
      });
      expect(result.status).toBe(400);
    });

    it("refuse un favori trop long", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        token,
        body: { photoUrl: "", favoriteTeam: "x".repeat(41) }
      });
      expect(result.status).toBe(400);
    });

    it("exige une session", async () => {
      const result = await call(memory, "PUT", "/api/profile", {
        body: { photoUrl: "https://example.com/a.png" }
      });
      expect(result.status).toBe(401);
    });
  });

  describe("GET /api/profile", () => {
    it("exige une session", async () => {
      const result = await call(memory, "GET", "/api/profile");
      expect(result.status).toBe(401);
    });

    it("renvoie le profil de l'utilisateur connecte", async () => {
      const result = await call(memory, "GET", "/api/profile", { token });
      expect(result.status).toBe(200);
      expect(result.body.profile).toBeDefined();
    });
  });

  describe("GET /api/users/:id/profile", () => {
    it("exige une session", async () => {
      const result = await call(memory, "GET", "/api/users/someone/profile");
      expect(result.status).toBe(401);
    });
  });
});
