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

const fakeUser: User = { id: "user-1", pseudo: "Dede", created_at: "2026-06-05" };

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
