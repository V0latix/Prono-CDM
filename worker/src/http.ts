import type { Env, User } from "./types";

export type RequestContext = {
  request: Request;
  env: Env;
  url: URL;
  user: User | null;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(
  request: Request,
  env: Env,
  data: unknown,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
      ...init.headers
    }
  });
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Vary": "Origin"
  };

  if (origin && (!env.FRONTEND_ORIGIN || origin === env.FRONTEND_ORIGIN)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export async function parseJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

export function requireUser(ctx: RequestContext): User {
  if (!ctx.user) {
    throw new HttpError(401, "Connexion requise.");
  }
  return ctx.user;
}

export function notFound(request: Request, env: Env): Response {
  return json(request, env, { error: "Route introuvable." }, { status: 404 });
}

export function errorResponse(request: Request, env: Env, error: unknown): Response {
  if (error instanceof HttpError) {
    return json(request, env, { error: error.message }, { status: error.status });
  }

  console.error(error);
  return json(
    request,
    env,
    { error: "Erreur serveur inattendue." },
    { status: 500 }
  );
}
