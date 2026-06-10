import { getUserFromSession, purgeExpiredSessions } from "./auth";
import { syncFootballData } from "./football-data";
import { corsHeaders, errorResponse, notFound, type RequestContext } from "./http";
import { sendPredictionReminders } from "./notifications";
import { route } from "./routes";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return notFound(request, env);
    }

    try {
      const ctx: RequestContext = {
        request,
        env,
        url,
        user: await getUserFromSession(request, env)
      };
      return await route(ctx);
    } catch (error) {
      return errorResponse(request, env, error);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await purgeExpiredSessions(env).catch((error) => console.error(error));
    const result = await syncFootballData(env);
    if (result.error) {
      console.error(result.error);
    }
    await sendPredictionReminders(env).catch((error) => console.error(error));
  }
};
