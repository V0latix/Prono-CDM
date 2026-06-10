import type { Env } from "./types";

// Brevo (ex-Sendinblue) : API HTTP transactionnelle. Gratuit jusqu'à 300
// mails/jour, et accepte un simple email expéditeur vérifié (pas de domaine
// requis), idéal pour un Worker Cloudflare sans domaine perso.
export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type FetchLike = typeof fetch;

/**
 * Envoie un email via Brevo. Renvoie `true` si l'email est parti.
 * Sans `BREVO_API_KEY` (local/tests), on ne fait rien et on renvoie `false`
 * pour ne jamais casser le flux applicatif.
 */
export async function sendEmail(
  env: Env,
  message: EmailMessage,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    console.warn("BREVO_API_KEY manquant : email non envoyé.");
    return false;
  }

  const senderEmail = env.EMAIL_FROM?.trim();
  if (!senderEmail) {
    console.warn("EMAIL_FROM manquant : email non envoyé.");
    return false;
  }

  const payload = {
    sender: {
      email: senderEmail,
      name: env.EMAIL_FROM_NAME?.trim() || "Prono CDM"
    },
    to: [{ email: message.to }],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text
  };

  try {
    const response = await fetchImpl(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Brevo a renvoyé ${response.status}: ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Échec d'envoi email Brevo:", error);
    return false;
  }
}

function appUrl(env: Env): string {
  return (env.APP_URL?.trim() || "https://prono-cdm-entre-pote.vercel.app").replace(/\/+$/, "");
}

function apiUrl(env: Env): string {
  return (
    env.API_URL?.trim() || "https://prono-cdm-api.volatix-prono-cdm.workers.dev"
  ).replace(/\/+$/, "");
}

export function verifyLink(env: Env, token: string): string {
  return `${apiUrl(env)}/api/notifications/verify?token=${encodeURIComponent(token)}`;
}

export function unsubscribeLink(env: Env, token: string): string {
  return `${apiUrl(env)}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#0f172a;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
    <div style="background:#1d4ed8;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700">⚽ Prono CDM</div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;background:#f1f5f9;color:#64748b;font-size:12px;line-height:1.5">${footerHtml}</div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${escapeHtml(label)}</a>`;
}

/** Email de confirmation envoyé à l'activation des notifications. */
export function confirmationEmail(env: Env, to: string, token: string): EmailMessage {
  const link = verifyLink(env, token);
  return {
    to,
    subject: "Confirme ton email pour recevoir tes rappels de pronos",
    html: shell(
      "Confirme ton email",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Tu viens d'activer les rappels par email sur Prono CDM. Clique ci-dessous pour confirmer ton adresse et commencer à recevoir tes rappels avant chaque match.</p>
       <p style="margin:0 0 20px">${button(link, "Confirmer mon email")}</p>
       <p style="margin:0;font-size:13px;color:#64748b">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>${link}</p>`,
      "Tu reçois cet email parce que ton adresse a été saisie sur Prono CDM. Si ce n'est pas toi, ignore simplement ce message."
    ),
    text: `Confirme ton email pour recevoir tes rappels de pronos Prono CDM : ${link}`
  };
}

export type ReminderMatch = {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

function formatKickoff(kickoffAt: string): string {
  const date = new Date(kickoffAt);
  if (Number.isNaN(date.getTime())) return kickoffAt;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris"
  }).format(date);
}

/** Email de rappel : matchs à venir pour lesquels le prono manque. */
export function reminderEmail(
  env: Env,
  to: string,
  token: string,
  matches: ReminderMatch[]
): EmailMessage {
  const appLink = `${appUrl(env)}/`;
  const unsubLink = unsubscribeLink(env, token);
  const count = matches.length;
  const intro =
    count === 1
      ? "Il te reste 1 prono à poser avant le coup d'envoi :"
      : `Il te reste ${count} pronos à poser avant le coup d'envoi :`;
  const rows = matches
    .map(
      (match) =>
        `<li style="margin:0 0 8px;font-size:15px"><strong>${escapeHtml(match.homeTeam)} – ${escapeHtml(
          match.awayTeam
        )}</strong><br><span style="color:#64748b;font-size:13px">${escapeHtml(
          formatKickoff(match.kickoffAt)
        )}</span></li>`
    )
    .join("");
  const textRows = matches
    .map((match) => `- ${match.homeTeam} – ${match.awayTeam} (${formatKickoff(match.kickoffAt)})`)
    .join("\n");

  return {
    to,
    subject:
      count === 1 ? "Pense à faire ton prono ⚽" : `${count} pronos à faire avant le coup d'envoi ⚽`,
    html: shell(
      "Fais tes pronos !",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${intro}</p>
       <ul style="margin:0 0 20px;padding-left:18px">${rows}</ul>
       <p style="margin:0 0 8px">${button(appLink, "Faire mes pronos")}</p>`,
      `Tu reçois cet email car tu as activé les rappels sur Prono CDM. <a href="${unsubLink}" style="color:#64748b">Se désinscrire</a>.`
    ),
    text: `Fais tes pronos sur Prono CDM !\n${intro}\n${textRows}\n\nFaire mes pronos : ${appLink}\nSe désinscrire : ${unsubLink}`
  };
}
