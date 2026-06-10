import { describe, expect, it, vi } from "vitest";
import {
  BREVO_ENDPOINT,
  confirmationEmail,
  reminderEmail,
  sendEmail,
  unsubscribeLink,
  verifyLink
} from "./email";
import type { Env } from "./types";

const baseEnv: Env = {
  DB: {} as unknown as D1Database,
  BREVO_API_KEY: "xkeysib-test",
  EMAIL_FROM: "expediteur@example.com",
  EMAIL_FROM_NAME: "Prono CDM",
  APP_URL: "https://app.test",
  API_URL: "https://api.test"
};

describe("sendEmail", () => {
  it("ne fait rien sans clé API et renvoie false", async () => {
    const fetchImpl = vi.fn();
    const sent = await sendEmail(
      { ...baseEnv, BREVO_API_KEY: undefined },
      { to: "a@b.c", subject: "s", html: "<p>h</p>", text: "t" },
      fetchImpl as unknown as typeof fetch
    );
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("poste vers Brevo avec la clé en header et renvoie true", async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 201 })
    );
    const sent = await sendEmail(
      baseEnv,
      { to: "joueur@example.com", subject: "Sujet", html: "<p>Salut</p>", text: "Salut" },
      fetchImpl as unknown as typeof fetch
    );
    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(BREVO_ENDPOINT);
    expect((init?.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    const payload = JSON.parse(String(init?.body));
    expect(payload.sender.email).toBe("expediteur@example.com");
    expect(payload.to).toEqual([{ email: "joueur@example.com" }]);
    expect(payload.subject).toBe("Sujet");
  });

  it("renvoie false quand Brevo répond une erreur", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 400 }));
    const sent = await sendEmail(
      baseEnv,
      { to: "a@b.c", subject: "s", html: "<p>h</p>", text: "t" },
      fetchImpl as unknown as typeof fetch
    );
    expect(sent).toBe(false);
  });
});

describe("templates", () => {
  it("construit les liens verify/unsubscribe sur l'URL de l'API", () => {
    expect(verifyLink(baseEnv, "tok123")).toBe("https://api.test/api/notifications/verify?token=tok123");
    expect(unsubscribeLink(baseEnv, "tok123")).toBe(
      "https://api.test/api/notifications/unsubscribe?token=tok123"
    );
  });

  it("email de confirmation contient le lien de validation avec le token", () => {
    const message = confirmationEmail(baseEnv, "joueur@example.com", "tok123");
    expect(message.to).toBe("joueur@example.com");
    expect(message.html).toContain("/api/notifications/verify?token=tok123");
    expect(message.text).toContain("tok123");
  });

  it("email de rappel liste les matchs, le lien app et la désinscription", () => {
    const message = reminderEmail(baseEnv, "joueur@example.com", "tok123", [
      { homeTeam: "France", awayTeam: "Brésil", kickoffAt: "2026-06-15T19:00:00.000Z" }
    ]);
    expect(message.html).toContain("France");
    expect(message.html).toContain("Brésil");
    expect(message.html).toContain("https://app.test/");
    expect(message.html).toContain("/api/notifications/unsubscribe?token=tok123");
  });
});
