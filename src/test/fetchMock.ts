import { vi } from "vitest";

export type MockRoute = {
  method?: string;
  path: string;
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};

export function installFetchMock(routes: MockRoute[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const parsedUrl = new URL(url, "https://app.test");
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find(
      (candidate) =>
        candidate.path === parsedUrl.pathname &&
        (candidate.method ?? "GET").toUpperCase() === method
    );

    if (!route) {
      return new Response(JSON.stringify({ error: `No mock for ${method} ${parsedUrl.pathname}` }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...route.headers
      }
    });
  });

  vi.stubGlobal("fetch", fetchMock);

  return { calls, fetchMock };
}
