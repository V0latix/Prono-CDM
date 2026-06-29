import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "./auth";
import { route } from "./routes";
import { errorResponse, type RequestContext } from "./http";
import type { Env, User } from "./types";

// Reproduit l'enveloppe de index.ts : route() propage les HttpError,
// c'est le fetch handler qui les convertit en réponse via errorResponse.
async function handle(ctx: RequestContext): Promise<Response> {
  try {
    return await route(ctx);
  } catch (error) {
    return errorResponse(ctx.request, ctx.env, error);
  }
}

type FakeDbOptions = {
  pinHash: string | null;
};

function fakeContext(options: {
  user: User | null;
  body: unknown;
  db: FakeDbOptions;
}): { ctx: RequestContext; updated: { pinHash?: string } } {
  const updated: { pinHash?: string } = {};

  const db = {
    prepare(sql: string) {
      const statement = {
        _args: [] as unknown[],
        bind(...args: unknown[]) {
          return { ...statement, _args: args };
        },
        async first<T>() {
          if (sql.includes("SELECT pin_hash FROM users")) {
            return options.db.pinHash === null
              ? null
              : ({ pin_hash: options.db.pinHash } as T);
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        async run() {
          if (sql.includes("UPDATE users SET pin_hash")) {
            updated.pinHash = this._args[0] as string;
            return { success: true };
          }
          throw new Error(`Unexpected query: ${sql}`);
        }
      };
      return statement;
    }
  };

  const request = new Request("https://api.test/api/profile/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options.body)
  });

  const ctx: RequestContext = {
    request,
    env: { DB: db } as unknown as Env,
    url: new URL(request.url),
    user: options.user
  };

  return { ctx, updated };
}

const fakeUser: User = { id: "user-1", pseudo: "Dede", created_at: "2026-06-05", is_admin: 0 };

describe("POST /api/profile/pin", () => {
  it("change le PIN quand le PIN actuel est correct", async () => {
    const currentHash = await hashPin("1234");
    const { ctx, updated } = fakeContext({
      user: fakeUser,
      body: { currentPin: "1234", newPin: "5678" },
      db: { pinHash: currentHash }
    });

    const response = await handle(ctx);

    expect(response.status).toBe(200);
    expect(updated.pinHash).toBeDefined();
    expect(await verifyPin("5678", updated.pinHash!)).toBe(true);
    expect(await verifyPin("1234", updated.pinHash!)).toBe(false);
  });

  it("refuse si le PIN actuel est incorrect", async () => {
    const currentHash = await hashPin("1234");
    const { ctx, updated } = fakeContext({
      user: fakeUser,
      body: { currentPin: "0000", newPin: "5678" },
      db: { pinHash: currentHash }
    });

    const response = await handle(ctx);

    expect(response.status).toBe(403);
    expect(updated.pinHash).toBeUndefined();
  });

  it("refuse si le nouveau PIN est identique à l'actuel", async () => {
    const currentHash = await hashPin("1234");
    const { ctx, updated } = fakeContext({
      user: fakeUser,
      body: { currentPin: "1234", newPin: "1234" },
      db: { pinHash: currentHash }
    });

    const response = await handle(ctx);

    expect(response.status).toBe(400);
    expect(updated.pinHash).toBeUndefined();
  });

  it("refuse un nouveau PIN invalide", async () => {
    const currentHash = await hashPin("1234");
    const { ctx, updated } = fakeContext({
      user: fakeUser,
      body: { currentPin: "1234", newPin: "12" },
      db: { pinHash: currentHash }
    });

    const response = await handle(ctx);

    expect(response.status).toBe(400);
    expect(updated.pinHash).toBeUndefined();
  });

  it("exige une session", async () => {
    const { ctx, updated } = fakeContext({
      user: null,
      body: { currentPin: "1234", newPin: "5678" },
      db: { pinHash: null }
    });

    const response = await handle(ctx);

    expect(response.status).toBe(401);
    expect(updated.pinHash).toBeUndefined();
  });
});

function matchRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "m1",
    external_id: "1",
    home_team: "France",
    away_team: "Bresil",
    kickoff_at: "2026-07-01T18:00:00.000Z",
    stage: "ROUND_OF_16",
    match_group: null,
    status: "TIMED",
    home_score: null,
    away_score: null,
    winner_team: null,
    winner_code: null,
    last_synced_at: "2026-06-30T00:00:00.000Z",
    prediction_id: null,
    ...overrides
  };
}

function bracketContext(user: User | null, rows: Array<Record<string, unknown>>): RequestContext {
  const db = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async all<T>() {
          if (sql.includes("FROM matches") && sql.includes("LEFT JOIN predictions")) {
            return { results: rows as T[] };
          }
          throw new Error(`Unexpected query: ${sql}`);
        }
      };
      return statement;
    }
  };

  const request = new Request("https://api.test/api/bracket", { method: "GET" });
  return {
    request,
    env: { DB: db } as unknown as Env,
    url: new URL(request.url),
    user
  };
}

describe("GET /api/bracket", () => {
  it("ne renvoie que les matchs a elimination directe, statut inclus", async () => {
    const ctx = bracketContext(fakeUser, [
      matchRow({ id: "group", stage: "GROUP_STAGE", match_group: "GROUP_A", status: "FINISHED" }),
      matchRow({ id: "r16", stage: "ROUND_OF_16", status: "TIMED" }),
      matchRow({ id: "final", stage: "FINAL", status: "FINISHED", home_score: 2, away_score: 1 })
    ]);

    const response = await handle(ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { matches: Array<{ id: string; stageKind: string }> };
    expect(body.matches.map((m) => m.id)).toEqual(["r16", "final"]);
    expect(body.matches.every((m) => m.stageKind === "KNOCKOUT")).toBe(true);
  });

  it("exige une session", async () => {
    const ctx = bracketContext(null, []);
    const response = await handle(ctx);
    expect(response.status).toBe(401);
  });
});
