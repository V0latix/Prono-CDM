import {
  getStageKind,
  normalizePredictionWinner,
  resultFromScore,
  type Winner
} from "../../src/shared/scoring";
import {
  clearSessionCookie,
  createSession,
  deleteCurrentSession,
  DUMMY_PIN_HASH,
  hashPin,
  isLoginLocked,
  nextFailedLoginAttempt,
  normalizePseudo,
  normalizePseudoKey,
  serializeSessionCookie,
  validatePin,
  verifyPin
} from "./auth";
import { getUserBadges } from "./badges";
import { getFootballDataSyncStatus, syncFootballData } from "./football-data";
import {
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
  shouldThrottleSync
} from "./invites";
import { confirmationEmail, sendEmail } from "./email";
import { parseDateWindow, type DateWindow } from "./leaderboard-window";
import { selectPredictionSession } from "./prediction-session";
import { HttpError, json, parseJson, requireUser, type RequestContext } from "./http";
import type {
  GroupMemberRow,
  GroupRow,
  MatchRow,
  PredictionRow,
  User,
  UserNotificationRow,
  UserProfileRow
} from "./types";

type AuthPayload = {
  pseudo?: string;
  pin?: string;
};

type LoginAttemptRow = {
  pseudo_key: string;
  failed_attempts: number;
  window_started_at: string;
  locked_until: string | null;
  last_failed_at: string;
};

type PredictionPayload = {
  predictedHomeScore?: number;
  predictedAwayScore?: number;
  predictedWinnerTeam?: string | null;
};

type ProfilePayload = {
  photoUrl?: string;
  tagline?: string;
  favoriteTeam?: string;
};

type PinChangePayload = {
  currentPin?: string;
  newPin?: string;
};

type GroupPayload = {
  name?: string;
};

type JoinByCodePayload = {
  code?: string;
};

type LeaderboardRow = {
  userId: string;
  pseudo: string;
  points: number;
  exactScores: number;
  correctResults: number;
  correctGoalDiffs: number;
  rank: number;
  rankChange: number;
  recentForm: Array<"exact" | "correct" | "bonus" | "miss">;
  photoUrl: string;
  tagline: string;
  favoriteTeam: string;
  submittedPredictions: number;
  averagePoints: number;
  successRate: number;
};

type ProfileStats = {
  submittedPredictions: number;
  totalMatches: number;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
  goalDiffBonuses: number;
  averagePoints: number;
  successRate: number;
  groupPoints: number;
  knockoutPoints: number;
};

type PublicGroupMember = {
  userId: string;
  pseudo: string;
  role: "owner" | "member";
  joinedAt: string;
};

type PublicGroup = {
  id: string;
  name: string;
  ownerUserId: string;
  ownerPseudo: string;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  inviteCode: string | null;
  createdAt: string;
  members?: PublicGroupMember[];
};

function assertMethod(ctx: RequestContext, method: string): void {
  if (ctx.request.method !== method) {
    throw new HttpError(405, "Méthode non autorisée.");
  }
}

function asScore(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 30) {
    throw new HttpError(400, `${field} doit être un entier entre 0 et 30.`);
  }
  return value as number;
}

function asLimitedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} doit être du texte.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new HttpError(400, `${field} doit contenir ${maxLength} caractères maximum.`);
  }
  return normalized;
}

function asProfilePhoto(value: unknown): string {
  // Les photos sont compressées côté client (~50 Ko) ; ce cap large est un
  // simple garde-fou anti-abus et n'empêche pas les photos prises au téléphone.
  const photo = asLimitedString(value, "La photo", 1_000_000);
  if (
    photo &&
    !/^https?:\/\/\S+$/i.test(photo) &&
    !/^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[a-z0-9+/=]+$/i.test(photo)
  ) {
    throw new HttpError(400, "La photo doit être une URL ou une image importée valide.");
  }
  return photo;
}

function assertPin(pin: string): void {
  try {
    validatePin(pin);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Code PIN invalide."
    );
  }
}

function pinLockError(): HttpError {
  return new HttpError(429, "Trop de tentatives. Réessaie dans 15 minutes.");
}

async function getLoginAttempt(ctx: RequestContext, pseudoKey: string): Promise<LoginAttemptRow | null> {
  return (
    (await ctx.env.DB.prepare("SELECT * FROM login_attempts WHERE pseudo_key = ? LIMIT 1")
      .bind(pseudoKey)
      .first<LoginAttemptRow>()) ?? null
  );
}

async function recordFailedLoginAttempt(
  ctx: RequestContext,
  pseudoKey: string,
  attempt: LoginAttemptRow | null
): Promise<void> {
  const nextAttempt = nextFailedLoginAttempt(attempt);
  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO login_attempts (pseudo_key, failed_attempts, window_started_at, locked_until, last_failed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pseudo_key) DO UPDATE SET
       failed_attempts = excluded.failed_attempts,
       window_started_at = excluded.window_started_at,
       locked_until = excluded.locked_until,
       last_failed_at = excluded.last_failed_at`
  )
    .bind(
      pseudoKey,
      nextAttempt.failedAttempts,
      nextAttempt.windowStartedAt,
      nextAttempt.lockedUntil,
      now
    )
    .run();

  if (nextAttempt.lockedUntil) {
    throw pinLockError();
  }
}

async function clearLoginAttempts(ctx: RequestContext, pseudoKey: string): Promise<void> {
  await ctx.env.DB.prepare("DELETE FROM login_attempts WHERE pseudo_key = ?")
    .bind(pseudoKey)
    .run();
}

function isFinished(status: string): boolean {
  return ["FINISHED", "AWARDED"].includes(status);
}

function isLocked(match: MatchRow): boolean {
  return Date.parse(match.kickoff_at) <= Date.now();
}

function publicMatch(match: MatchRow, prediction?: PredictionRow | null) {
  return {
    id: match.id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    kickoffAt: match.kickoff_at,
    stage: match.stage,
    stageKind: getStageKind(match.stage),
    group: match.match_group ?? null,
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    winnerTeam: match.winner_team,
    lastSyncedAt: match.last_synced_at,
    locked: isLocked(match),
    prediction: prediction
      ? {
          predictedHomeScore: prediction.predicted_home_score,
          predictedAwayScore: prediction.predicted_away_score,
          predictedWinnerTeam: prediction.predicted_winner_team,
          points: prediction.points,
          exactScore: Boolean(prediction.exact_score),
          correctResult: Boolean(prediction.correct_result),
          correctGoalDiff: Boolean(prediction.correct_goal_diff),
          updatedAt: prediction.updated_at
        }
      : null
  };
}

function predictionFromJoinedRow(
  row: Record<string, unknown>,
  userId: string,
  matchId: string
): PredictionRow | null {
  if (!row.prediction_id) return null;

  return {
    id: row.prediction_id,
    user_id: userId,
    match_id: matchId,
    predicted_home_score: row.predicted_home_score,
    predicted_away_score: row.predicted_away_score,
    predicted_winner_team: row.predicted_winner_team,
    predicted_winner_code: row.predicted_winner_code,
    points: row.points,
    exact_score: row.exact_score,
    correct_result: row.correct_result,
    correct_goal_diff: row.correct_goal_diff,
    created_at: row.prediction_created_at,
    updated_at: row.prediction_updated_at
  } as PredictionRow;
}

function publicMatchFromJoinedRow(row: Record<string, unknown>, userId: string) {
  const match = row as unknown as MatchRow;
  return publicMatch(
    match,
    predictionFromJoinedRow(row, userId, match.id)
  );
}

function publicProfile(profile: UserProfileRow | null) {
  return {
    photoUrl: profile?.photo_url ?? "",
    tagline: profile?.tagline ?? "",
    favoriteTeam: profile?.favorite_team ?? "",
    updatedAt: profile?.updated_at ?? null
  };
}

function publicGroup(
  group: GroupRow & {
    owner_pseudo: string;
    member_count: number;
    is_member: number;
  },
  currentUserId: string,
  members?: PublicGroupMember[]
): PublicGroup {
  const isMember = Boolean(group.is_member);
  return {
    id: group.id,
    name: group.name,
    ownerUserId: group.owner_user_id,
    ownerPseudo: group.owner_pseudo,
    memberCount: Number(group.member_count ?? 0),
    isMember,
    isOwner: group.owner_user_id === currentUserId,
    // Le code n'est partagé qu'aux membres pour éviter de le récupérer en masse.
    inviteCode: isMember ? group.invite_code ?? null : null,
    createdAt: group.created_at,
    members
  };
}

async function getGroupRows(ctx: RequestContext, currentUserId: string, userId?: string) {
  const filter = userId
    ? `WHERE EXISTS (
         SELECT 1 FROM group_members selected_member
         WHERE selected_member.group_id = prediction_groups.id AND selected_member.user_id = ?
       )`
    : "";
  const bindings = userId ? [currentUserId, userId] : [currentUserId];
  return ctx.env.DB.prepare(
    `SELECT prediction_groups.*, owner.pseudo AS owner_pseudo,
            COUNT(all_members.user_id) AS member_count,
            MAX(CASE WHEN current_member.user_id IS NULL THEN 0 ELSE 1 END) AS is_member
     FROM prediction_groups
     JOIN users owner ON owner.id = prediction_groups.owner_user_id
     LEFT JOIN group_members all_members ON all_members.group_id = prediction_groups.id
     LEFT JOIN group_members current_member
       ON current_member.group_id = prediction_groups.id AND current_member.user_id = ?
     ${filter}
     GROUP BY prediction_groups.id, prediction_groups.name, prediction_groups.owner_user_id, prediction_groups.created_at, owner.pseudo
     ORDER BY prediction_groups.created_at DESC`
  )
    .bind(...bindings)
    .all<GroupRow & { owner_pseudo: string; member_count: number; is_member: number }>();
}

async function getGroupMembersByGroupId(
  ctx: RequestContext,
  groupIds: string[]
): Promise<Map<string, PublicGroupMember[]>> {
  const membersByGroup = new Map<string, PublicGroupMember[]>();
  for (const groupId of groupIds) {
    const members = await ctx.env.DB.prepare(
      `SELECT group_members.*, users.pseudo
       FROM group_members
       JOIN users ON users.id = group_members.user_id
       WHERE group_members.group_id = ?
       ORDER BY group_members.role DESC, group_members.created_at ASC`
    )
      .bind(groupId)
      .all<GroupMemberRow & { pseudo: string }>();
    membersByGroup.set(
      groupId,
      (members.results ?? []).map((member) => ({
        userId: member.user_id,
        pseudo: member.pseudo,
        role: member.role,
        joinedAt: member.created_at
      }))
    );
  }
  return membersByGroup;
}

async function assignInviteCode(ctx: RequestContext, groupId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const result = await ctx.env.DB.prepare(
      "UPDATE prediction_groups SET invite_code = ? WHERE id = ? AND invite_code IS NULL"
    )
      .bind(code, groupId)
      .run();
    if (result.meta.changes && result.meta.changes > 0) return code;
    const existing = await ctx.env.DB.prepare(
      "SELECT invite_code FROM prediction_groups WHERE id = ? LIMIT 1"
    )
      .bind(groupId)
      .first<{ invite_code: string | null }>();
    if (existing?.invite_code) return existing.invite_code;
  }
  throw new HttpError(500, "Impossible de générer un code d'invitation.");
}

async function getPublicGroups(
  ctx: RequestContext,
  currentUserId: string,
  options: { userId?: string; includeMembers?: boolean } = {}
): Promise<PublicGroup[]> {
  const rows = await getGroupRows(ctx, currentUserId, options.userId);
  const groups = rows.results ?? [];
  // Backfill paresseux : les groupes créés avant les codes d'invitation
  // reçoivent un code dès qu'un membre consulte la liste.
  for (const group of groups) {
    if (group.is_member && !group.invite_code) {
      group.invite_code = await assignInviteCode(ctx, group.id);
    }
  }
  const membersByGroup = options.includeMembers
    ? await getGroupMembersByGroupId(ctx, groups.map((group) => group.id))
    : new Map<string, PublicGroupMember[]>();
  return groups.map((group) =>
    publicGroup(group, currentUserId, options.includeMembers ? membersByGroup.get(group.id) ?? [] : undefined)
  );
}

async function getProfileStats(ctx: RequestContext, userId: string): Promise<ProfileStats> {
  const [matchCount, predictions] = await Promise.all([
    ctx.env.DB.prepare("SELECT COUNT(*) AS total FROM matches").first<{ total: number }>(),
    ctx.env.DB.prepare(
      `SELECT predictions.*, matches.stage, matches.status
       FROM predictions
       JOIN matches ON matches.id = predictions.match_id
       WHERE predictions.user_id = ?`
    )
      .bind(userId)
      .all<PredictionRow & { stage: string; status: string }>()
  ]);
  const rows = predictions.results ?? [];
  const finishedRows = rows.filter((row) => isFinished(row.status));
  const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
  const finishedPoints = finishedRows.reduce((sum, row) => sum + row.points, 0);
  const exactScores = finishedRows.filter((row) => row.exact_score).length;
  const correctResults = finishedRows.filter(
    (row) => row.correct_result && !row.exact_score
  ).length;

  return {
    submittedPredictions: rows.length,
    totalMatches: matchCount?.total ?? 0,
    totalPoints,
    exactScores,
    correctResults,
    goalDiffBonuses: finishedRows.filter(
      (row) => row.correct_goal_diff && !row.exact_score
    ).length,
    averagePoints: finishedRows.length ? finishedPoints / finishedRows.length : 0,
    successRate: finishedRows.length
      ? ((exactScores + correctResults) / finishedRows.length) * 100
      : 0,
    groupPoints: rows
      .filter((row) => getStageKind(row.stage) === "GROUP")
      .reduce((sum, row) => sum + row.points, 0),
    knockoutPoints: rows
      .filter((row) => getStageKind(row.stage) === "KNOCKOUT")
      .reduce((sum, row) => sum + row.points, 0)
  };
}

async function register(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const body = await parseJson<AuthPayload>(ctx.request);
  const pseudo = normalizePseudo(body.pseudo ?? "");
  const pin = body.pin ?? "";

  if (pseudo.length < 2 || pseudo.length > 32) {
    throw new HttpError(400, "Le pseudo doit contenir 2 à 32 caractères.");
  }
  assertPin(pin);

  const pseudoKey = normalizePseudoKey(pseudo);
  const existingUser = await ctx.env.DB.prepare(
    "SELECT id FROM users WHERE pseudo = ? COLLATE NOCASE LIMIT 1"
  )
    .bind(pseudoKey)
    .first<{ id: string }>();
  if (existingUser) {
    throw new HttpError(409, "Ce pseudo est déjà utilisé.");
  }

  const userId = crypto.randomUUID();
  const pinHash = await hashPin(pin);
  try {
    await ctx.env.DB.prepare(
      "INSERT INTO users (id, pseudo, pin_hash) VALUES (?, ?, ?)"
    )
      .bind(userId, pseudo, pinHash)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unable to create user", message);
    if (message.toLowerCase().includes("unique")) {
      throw new HttpError(409, "Ce pseudo est déjà utilisé.");
    }
    throw new HttpError(500, "Impossible de créer le compte pour le moment.");
  }

  const token = await createSession(ctx.env, userId);
  return json(
    ctx.request,
    ctx.env,
    { user: { id: userId, pseudo }, sessionToken: token },
    {
      headers: {
        "Set-Cookie": serializeSessionCookie(ctx.request, ctx.env, token)
      }
    }
  );
}

async function login(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const body = await parseJson<AuthPayload>(ctx.request);
  const pseudo = normalizePseudo(body.pseudo ?? "");
  const pin = body.pin ?? "";
  assertPin(pin);
  const pseudoKey = normalizePseudoKey(pseudo);

  const loginAttempt = await getLoginAttempt(ctx, pseudoKey);
  if (isLoginLocked(loginAttempt)) {
    throw pinLockError();
  }

  const user = await ctx.env.DB.prepare(
    `SELECT id, pseudo, pin_hash, created_at
     FROM users
     WHERE pseudo = ? COLLATE NOCASE
     ORDER BY created_at ASC
     LIMIT 1`
  )
    .bind(pseudo)
    .first<User & { pin_hash: string }>();

  // On vérifie toujours un hash (factice si le compte n'existe pas) pour que le
  // temps de réponse ne révèle pas l'existence d'un pseudo.
  const pinValid = await verifyPin(pin, user?.pin_hash ?? DUMMY_PIN_HASH);
  if (!user || !pinValid) {
    await recordFailedLoginAttempt(ctx, pseudoKey, loginAttempt);
    throw new HttpError(401, "Pseudo ou PIN incorrect.");
  }

  await clearLoginAttempts(ctx, pseudoKey);

  const token = await createSession(ctx.env, user.id);
  return json(
    ctx.request,
    ctx.env,
    { user: { id: user.id, pseudo: user.pseudo, createdAt: user.created_at }, sessionToken: token },
    {
      headers: {
        "Set-Cookie": serializeSessionCookie(ctx.request, ctx.env, token)
      }
    }
  );
}

async function logout(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  await deleteCurrentSession(ctx.request, ctx.env);
  return json(
    ctx.request,
    ctx.env,
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie(ctx.request, ctx.env) } }
  );
}

async function me(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  return json(ctx.request, ctx.env, { user: ctx.user });
}

async function getProfile(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const profile = await ctx.env.DB.prepare(
    "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserProfileRow>();

  return json(ctx.request, ctx.env, {
    profile: publicProfile(profile),
    badges: await getUserBadges(ctx.env, user.id),
    groups: await getPublicGroups(ctx, user.id, { userId: user.id, includeMembers: true })
  });
}

type NotificationPayload = {
  email?: string;
  enabled?: boolean;
};

function asEmail(value: unknown): string {
  const email = asLimitedString(value, "L'email", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "L'email n'est pas valide.");
  }
  return email;
}

function generateNotificationToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function publicNotifications(row: UserNotificationRow | null) {
  return {
    email: row?.email ?? "",
    enabled: Boolean(row?.enabled),
    verified: Boolean(row?.verified)
  };
}

function htmlResponse(ctx: RequestContext, title: string, message: string, status = 200): Response {
  const appUrl = (ctx.env.APP_URL?.trim() || "https://prono-cdm-entre-pote.vercel.app").replace(/\/+$/, "");
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#0f172a;font-family:Helvetica,Arial,sans-serif;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">
  <div style="max-width:420px;background:#fff;border-radius:16px;padding:28px;text-align:center">
    <div style="font-size:24px;margin-bottom:8px">⚽ Prono CDM</div>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px">${message}</p>
    <a href="${appUrl}/" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ouvrir l'app</a>
  </div>
</body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function getNotifications(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const row = await ctx.env.DB.prepare(
    "SELECT * FROM user_notifications WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserNotificationRow>();
  return json(ctx.request, ctx.env, { notifications: publicNotifications(row) });
}

async function saveNotifications(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "PUT");
  const user = requireUser(ctx);
  const body = await parseJson<NotificationPayload>(ctx.request);
  const email = asEmail(body.email ?? "");
  const enabled = body.enabled === true;

  if (enabled && !email) {
    throw new HttpError(400, "Renseigne un email pour activer les notifications.");
  }

  const existing = await ctx.env.DB.prepare(
    "SELECT * FROM user_notifications WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserNotificationRow>();

  const emailChanged = !existing || existing.email !== email;
  const token = existing?.token || generateNotificationToken();
  const verified = emailChanged ? 0 : existing?.verified ?? 0;

  await ctx.env.DB.prepare(
    `INSERT INTO user_notifications (user_id, email, enabled, verified, token, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       enabled = excluded.enabled,
       verified = excluded.verified,
       token = excluded.token,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(user.id, email, enabled ? 1 : 0, verified, token)
    .run();

  // Envoi de confirmation seulement quand il faut encore valider l'adresse.
  if (enabled && email && !verified) {
    await sendEmail(ctx.env, confirmationEmail(ctx.env, email, token)).catch((error) =>
      console.error(error)
    );
  }

  const row = await ctx.env.DB.prepare(
    "SELECT * FROM user_notifications WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserNotificationRow>();
  return json(ctx.request, ctx.env, { notifications: publicNotifications(row) });
}

async function verifyNotifications(ctx: RequestContext): Promise<Response> {
  const token = ctx.url.searchParams.get("token") ?? "";
  if (!token) {
    return htmlResponse(ctx, "Lien invalide", "Ce lien de confirmation est incomplet.", 400);
  }
  const row = await ctx.env.DB.prepare(
    "SELECT user_id FROM user_notifications WHERE token = ? LIMIT 1"
  )
    .bind(token)
    .first<{ user_id: string }>();
  if (!row) {
    return htmlResponse(ctx, "Lien expiré", "Ce lien de confirmation n'est plus valide.", 404);
  }
  await ctx.env.DB.prepare(
    "UPDATE user_notifications SET verified = 1, updated_at = CURRENT_TIMESTAMP WHERE token = ?"
  )
    .bind(token)
    .run();
  return htmlResponse(
    ctx,
    "Email confirmé ✅",
    "C'est bon ! Tu recevras désormais un rappel avant chaque match à pronostiquer."
  );
}

async function unsubscribeNotifications(ctx: RequestContext): Promise<Response> {
  const token = ctx.url.searchParams.get("token") ?? "";
  if (!token) {
    return htmlResponse(ctx, "Lien invalide", "Ce lien de désinscription est incomplet.", 400);
  }
  const row = await ctx.env.DB.prepare(
    "SELECT user_id FROM user_notifications WHERE token = ? LIMIT 1"
  )
    .bind(token)
    .first<{ user_id: string }>();
  if (!row) {
    return htmlResponse(ctx, "Lien expiré", "Ce lien de désinscription n'est plus valide.", 404);
  }
  await ctx.env.DB.prepare(
    "UPDATE user_notifications SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE token = ?"
  )
    .bind(token)
    .run();
  return htmlResponse(
    ctx,
    "Désinscription confirmée",
    "Tu ne recevras plus de rappels par email. Tu peux les réactiver à tout moment depuis ton profil."
  );
}

async function getPublicUserProfile(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const viewer = requireUser(ctx);
  const match = ctx.url.pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  const userId = match?.[1];
  if (!userId) throw new HttpError(400, "Utilisateur manquant.");

  const user = await ctx.env.DB.prepare(
    "SELECT id, pseudo, created_at FROM users WHERE id = ? LIMIT 1"
  )
    .bind(userId)
    .first<User>();
  if (!user) throw new HttpError(404, "Utilisateur introuvable.");

  if (viewer.id !== user.id) {
    await ctx.env.DB.prepare(
      `INSERT OR IGNORE INTO profile_views (viewer_user_id, viewed_user_id)
       VALUES (?, ?)`
    )
      .bind(viewer.id, user.id)
      .run();
  }

  const profile = await ctx.env.DB.prepare(
    "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserProfileRow>();
  const stats = await getProfileStats(ctx, user.id);
  const rank = (await buildLeaderboard(ctx)).find(
    (row) => row.userId === user.id
  );

  return json(ctx.request, ctx.env, {
    user: { id: user.id, pseudo: user.pseudo },
    profile: publicProfile(profile),
    stats,
    badges: await getUserBadges(ctx.env, user.id),
    groups: await getPublicGroups(ctx, ctx.user?.id ?? user.id, { userId: user.id }),
    rank: rank?.rank ?? null
  });
}

async function saveProfile(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "PUT");
  const user = requireUser(ctx);
  const body = await parseJson<ProfilePayload>(ctx.request);
  const photoUrl = asProfilePhoto(body.photoUrl ?? "");
  const tagline = asLimitedString(body.tagline ?? "", "La phrase d'accroche", 90);
  const favoriteTeam = asLimitedString(body.favoriteTeam ?? "", "Le favori", 40);

  await ctx.env.DB.prepare(
    `INSERT INTO user_profiles (
       user_id, photo_url, tagline, favorite_team, updated_at
     )
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       photo_url = excluded.photo_url,
       tagline = excluded.tagline,
       favorite_team = excluded.favorite_team,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(user.id, photoUrl, tagline, favoriteTeam)
    .run();

  const profile = await ctx.env.DB.prepare(
    "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<UserProfileRow>();

  return json(ctx.request, ctx.env, {
    profile: publicProfile(profile),
    badges: await getUserBadges(ctx.env, user.id),
    groups: await getPublicGroups(ctx, user.id, { userId: user.id, includeMembers: true })
  });
}

async function changePin(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const user = requireUser(ctx);
  const body = await parseJson<PinChangePayload>(ctx.request);
  const currentPin = body.currentPin ?? "";
  const newPin = body.newPin ?? "";
  assertPin(currentPin);
  assertPin(newPin);
  if (currentPin === newPin) {
    throw new HttpError(400, "Le nouveau PIN doit être différent de l'actuel.");
  }

  const row = await ctx.env.DB.prepare(
    "SELECT pin_hash FROM users WHERE id = ? LIMIT 1"
  )
    .bind(user.id)
    .first<{ pin_hash: string }>();
  if (!row || !(await verifyPin(currentPin, row.pin_hash))) {
    throw new HttpError(403, "PIN actuel incorrect.");
  }

  await ctx.env.DB.prepare("UPDATE users SET pin_hash = ? WHERE id = ?")
    .bind(await hashPin(newPin), user.id)
    .run();

  return json(ctx.request, ctx.env, { ok: true });
}

async function listGroups(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function createGroup(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const user = requireUser(ctx);
  const body = await parseJson<GroupPayload>(ctx.request);
  const name = asLimitedString(body.name ?? "", "Le nom du groupe", 36);
  if (name.length < 2) {
    throw new HttpError(400, "Le nom du groupe doit contenir au moins 2 caractères.");
  }

  const groupId = crypto.randomUUID();
  try {
    await ctx.env.DB.prepare(
      "INSERT INTO prediction_groups (id, name, owner_user_id, invite_code) VALUES (?, ?, ?, ?)"
    )
      .bind(groupId, name, user.id, generateInviteCode())
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("unique")) {
      throw new HttpError(409, "Ce nom de groupe existe déjà.");
    }
    throw error;
  }

  await ctx.env.DB.prepare(
    "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner')"
  )
    .bind(groupId, user.id)
    .run();

  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function joinGroup(ctx: RequestContext, groupId: string): Promise<Response> {
  assertMethod(ctx, "POST");
  const user = requireUser(ctx);
  const group = await ctx.env.DB.prepare("SELECT * FROM prediction_groups WHERE id = ? LIMIT 1")
    .bind(groupId)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, "Groupe introuvable.");

  await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
  )
    .bind(group.id, user.id)
    .run();

  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function joinGroupByCode(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const user = requireUser(ctx);
  const body = await parseJson<JoinByCodePayload>(ctx.request);
  const code = normalizeInviteCode(body.code ?? "");
  if (!isValidInviteCode(code)) {
    throw new HttpError(400, "Code d'invitation invalide.");
  }

  const group = await ctx.env.DB.prepare(
    "SELECT * FROM prediction_groups WHERE invite_code = ? LIMIT 1"
  )
    .bind(code)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, "Aucun groupe ne correspond à ce code.");

  await ctx.env.DB.prepare(
    "INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')"
  )
    .bind(group.id, user.id)
    .run();

  return json(ctx.request, ctx.env, {
    joinedGroupId: group.id,
    joinedGroupName: group.name,
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function leaveGroup(ctx: RequestContext, groupId: string): Promise<Response> {
  assertMethod(ctx, "POST");
  const user = requireUser(ctx);
  const group = await ctx.env.DB.prepare("SELECT * FROM prediction_groups WHERE id = ? LIMIT 1")
    .bind(groupId)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, "Groupe introuvable.");
  if (group.owner_user_id === user.id) {
    throw new HttpError(400, "Le créateur ne peut pas quitter son propre groupe.");
  }

  await ctx.env.DB.prepare(
    "DELETE FROM group_members WHERE group_id = ? AND user_id = ?"
  )
    .bind(group.id, user.id)
    .run();

  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function removeGroupMember(
  ctx: RequestContext,
  groupId: string,
  memberUserId: string
): Promise<Response> {
  assertMethod(ctx, "DELETE");
  const user = requireUser(ctx);
  const group = await ctx.env.DB.prepare("SELECT * FROM prediction_groups WHERE id = ? LIMIT 1")
    .bind(groupId)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, "Groupe introuvable.");
  if (group.owner_user_id !== user.id) {
    throw new HttpError(403, "Seul le créateur du groupe peut gérer ses membres.");
  }
  if (memberUserId === user.id) {
    throw new HttpError(400, "Le créateur ne peut pas se retirer du groupe.");
  }

  await ctx.env.DB.prepare(
    "DELETE FROM group_members WHERE group_id = ? AND user_id = ?"
  )
    .bind(group.id, memberUserId)
    .run();

  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function deleteGroup(ctx: RequestContext, groupId: string): Promise<Response> {
  assertMethod(ctx, "DELETE");
  const user = requireUser(ctx);
  const group = await ctx.env.DB.prepare("SELECT * FROM prediction_groups WHERE id = ? LIMIT 1")
    .bind(groupId)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, "Groupe introuvable.");
  if (group.owner_user_id !== user.id) {
    throw new HttpError(403, "Seul le créateur du groupe peut le supprimer.");
  }

  await ctx.env.DB.prepare("DELETE FROM prediction_groups WHERE id = ?")
    .bind(group.id)
    .run();

  return json(ctx.request, ctx.env, {
    groups: await getPublicGroups(ctx, user.id, { includeMembers: true })
  });
}

async function listMatches(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return json(ctx.request, ctx.env, {
    matches: (rows.results ?? []).map((row) => {
      const match = row as unknown as MatchRow;
      const prediction = row.prediction_id
        ? ({
            id: row.prediction_id,
            user_id: user.id,
            match_id: match.id,
            predicted_home_score: row.predicted_home_score,
            predicted_away_score: row.predicted_away_score,
            predicted_winner_team: row.predicted_winner_team,
            predicted_winner_code: row.predicted_winner_code,
            points: row.points,
            exact_score: row.exact_score,
            correct_result: row.correct_result,
            correct_goal_diff: row.correct_goal_diff,
            created_at: row.prediction_created_at,
            updated_at: row.prediction_updated_at
          } as PredictionRow)
        : null;
      return publicMatch(match, prediction);
    })
  });
}

async function savePrediction(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "PUT");
  const user = requireUser(ctx);
  const matchId = ctx.url.pathname.split("/").at(-1);
  if (!matchId) throw new HttpError(400, "Match manquant.");

  const match = await ctx.env.DB.prepare("SELECT * FROM matches WHERE id = ?")
    .bind(matchId)
    .first<MatchRow>();
  if (!match) throw new HttpError(404, "Match introuvable.");
  if (isLocked(match)) {
    throw new HttpError(409, "Ce match est verrouillé depuis le coup d'envoi.");
  }

  const body = await parseJson<PredictionPayload>(ctx.request);
  const predictedHomeScore = asScore(body.predictedHomeScore, "Score domicile");
  const predictedAwayScore = asScore(body.predictedAwayScore, "Score extérieur");
  const stageKind = getStageKind(match.stage);
  const scoreWinner = resultFromScore(predictedHomeScore, predictedAwayScore);
  let predictedWinnerCode: Winner = scoreWinner;
  let predictedWinnerTeam: string | null = null;

  if (stageKind === "KNOCKOUT" && scoreWinner === "DRAW") {
    if (
      body.predictedWinnerTeam !== match.home_team &&
      body.predictedWinnerTeam !== match.away_team
    ) {
      throw new HttpError(
        400,
        "Pour un nul en élimination directe, choisis l'équipe qualifiée."
      );
    }
    predictedWinnerTeam = body.predictedWinnerTeam;
    predictedWinnerCode =
      body.predictedWinnerTeam === match.home_team ? "HOME_TEAM" : "AWAY_TEAM";
  } else if (stageKind === "KNOCKOUT") {
    predictedWinnerTeam =
      normalizePredictionWinner(
        {
          predictedHomeScore,
          predictedAwayScore,
          predictedWinner: null
        },
        stageKind
      ) === "HOME_TEAM"
        ? match.home_team
        : match.away_team;
  } else {
    predictedWinnerCode = scoreWinner;
    predictedWinnerTeam = scoreWinner === "DRAW"
      ? "Match nul"
      : scoreWinner === "HOME_TEAM"
        ? match.home_team
        : match.away_team;
  }

  // Timestamps ISO UTC explicites pour que les comparaisons de dates (badges
  // "dernière minute", "VAR émotionnelle"...) restent cohérentes avec kickoff_at.
  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `INSERT INTO predictions (
       id, user_id, match_id, predicted_home_score, predicted_away_score,
       predicted_winner_team, predicted_winner_code, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       predicted_home_score = excluded.predicted_home_score,
       predicted_away_score = excluded.predicted_away_score,
       predicted_winner_team = excluded.predicted_winner_team,
       predicted_winner_code = excluded.predicted_winner_code,
       updated_at = excluded.updated_at`
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      match.id,
      predictedHomeScore,
      predictedAwayScore,
      predictedWinnerTeam,
      predictedWinnerCode,
      now,
      now
    )
    .run();

  const prediction = await ctx.env.DB.prepare(
    "SELECT * FROM predictions WHERE user_id = ? AND match_id = ?"
  )
    .bind(user.id, match.id)
    .first<PredictionRow>();

  return json(ctx.request, ctx.env, { match: publicMatch(match, prediction) });
}

type LeaderboardPredictionRow = PredictionRow & {
  stage: string;
  status: string;
  kickoff_at: string;
};

function createLeaderboardRows(
  users: Array<User & { photo_url: string | null; tagline: string | null; favorite_team: string | null }>,
  predictions: LeaderboardPredictionRow[]
): LeaderboardRow[] {
  const byUser = new Map<string, LeaderboardRow>();
  const evaluatedByUser = new Map<string, number>();
  const successByUser = new Map<string, number>();
  const finishedPointsByUser = new Map<string, number>();
  const recentRowsByUser = new Map<string, LeaderboardPredictionRow[]>();

  for (const user of users) {
    byUser.set(user.id, {
      userId: user.id,
      pseudo: user.pseudo,
      points: 0,
      exactScores: 0,
      correctResults: 0,
      correctGoalDiffs: 0,
      rank: 0,
      rankChange: 0,
      recentForm: [],
      photoUrl: user.photo_url ?? "",
      tagline: user.tagline ?? "",
      favoriteTeam: user.favorite_team ?? "",
      submittedPredictions: 0,
      averagePoints: 0,
      successRate: 0
    });
    evaluatedByUser.set(user.id, 0);
    successByUser.set(user.id, 0);
    finishedPointsByUser.set(user.id, 0);
    recentRowsByUser.set(user.id, []);
  }

  for (const row of predictions) {
    const target = byUser.get(row.user_id);
    if (!target) continue;
    target.submittedPredictions += 1;
    target.points += row.points;
    if (isFinished(row.status)) {
      evaluatedByUser.set(row.user_id, (evaluatedByUser.get(row.user_id) ?? 0) + 1);
      finishedPointsByUser.set(
        row.user_id,
        (finishedPointsByUser.get(row.user_id) ?? 0) + row.points
      );
      target.exactScores += row.exact_score ? 1 : 0;
      target.correctResults += row.correct_result && !row.exact_score ? 1 : 0;
      target.correctGoalDiffs += row.correct_goal_diff && !row.exact_score ? 1 : 0;
      successByUser.set(
        row.user_id,
        (successByUser.get(row.user_id) ?? 0) +
          (row.exact_score || row.correct_result ? 1 : 0)
      );
      recentRowsByUser.get(row.user_id)?.push(row);
    }
  }

  const ranking = [...byUser.values()];

  for (const row of ranking) {
    const evaluated = evaluatedByUser.get(row.userId) ?? 0;
    row.averagePoints = evaluated
      ? (finishedPointsByUser.get(row.userId) ?? 0) / evaluated
      : 0;
    row.successRate = evaluated
      ? ((successByUser.get(row.userId) ?? 0) / evaluated) * 100
      : 0;
    row.recentForm = (recentRowsByUser.get(row.userId) ?? [])
      .sort((a, b) => Date.parse(b.kickoff_at) - Date.parse(a.kickoff_at))
      .slice(0, 5)
      .map((prediction) => {
        if (prediction.exact_score) return "exact";
        if (prediction.correct_goal_diff) return "bonus";
        if (prediction.correct_result) return "correct";
        return "miss";
      });
  }

  ranking.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
    if (b.correctResults !== a.correctResults) return b.correctResults - a.correctResults;
    if (b.correctGoalDiffs !== a.correctGoalDiffs) return b.correctGoalDiffs - a.correctGoalDiffs;
    if (b.averagePoints !== a.averagePoints) return b.averagePoints - a.averagePoints;
    return a.pseudo.localeCompare(b.pseudo, "fr");
  });

  ranking.forEach((row, index) => {
    row.rank = index + 1;
  });

  return ranking;
}

async function buildLeaderboard(
  ctx: RequestContext,
  groupId?: string,
  window?: DateWindow
): Promise<LeaderboardRow[]> {
  const userQuery = groupId
    ? `SELECT users.id, users.pseudo, users.created_at,
              user_profiles.photo_url, user_profiles.tagline, user_profiles.favorite_team
       FROM users
       JOIN group_members ON group_members.user_id = users.id
       LEFT JOIN user_profiles ON user_profiles.user_id = users.id
       WHERE group_members.group_id = ?
       ORDER BY group_members.created_at ASC`
    : `SELECT users.id, users.pseudo, users.created_at,
              user_profiles.photo_url, user_profiles.tagline, user_profiles.favorite_team
       FROM users
       LEFT JOIN user_profiles ON user_profiles.user_id = users.id
       ORDER BY users.created_at ASC`;
  const users = groupId
    ? await ctx.env.DB.prepare(userQuery)
        .bind(groupId)
        .all<User & { photo_url: string | null; tagline: string | null; favorite_team: string | null }>()
    : await ctx.env.DB.prepare(userQuery)
        .all<User & { photo_url: string | null; tagline: string | null; favorite_team: string | null }>();
  const rows = await ctx.env.DB.prepare(
    `SELECT predictions.*, matches.stage, matches.status, matches.kickoff_at
     FROM predictions
     JOIN matches ON matches.id = predictions.match_id`
  ).all<LeaderboardPredictionRow>();
  const userRows = users.results ?? [];
  const allPredictionRows = rows.results ?? [];
  // Classement hebdomadaire : on ne garde que les matchs de la fenêtre demandée.
  const predictionRows = window
    ? allPredictionRows.filter(
        (row) => row.kickoff_at >= window.from && row.kickoff_at < window.to
      )
    : allPredictionRows;
  const latestFinishedKickoff = predictionRows
    .filter((row) => isFinished(row.status))
    .map((row) => row.kickoff_at)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const ranking = createLeaderboardRows(userRows, predictionRows);

  if (latestFinishedKickoff) {
    const previousRanking = createLeaderboardRows(
      userRows,
      predictionRows.filter(
        (row) => !isFinished(row.status) || Date.parse(row.kickoff_at) < Date.parse(latestFinishedKickoff)
      )
    );
    const previousRankByUser = new Map(
      previousRanking.map((row) => [row.userId, row.rank])
    );
    for (const row of ranking) {
      row.rankChange = (previousRankByUser.get(row.userId) ?? row.rank) - row.rank;
    }
  }

  return ranking;
}

async function leaderboard(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  requireUser(ctx);
  const groupId = ctx.url.searchParams.get("groupId") ?? undefined;
  if (groupId) {
    const group = await ctx.env.DB.prepare("SELECT id FROM prediction_groups WHERE id = ? LIMIT 1")
      .bind(groupId)
      .first<{ id: string }>();
    if (!group) throw new HttpError(404, "Groupe introuvable.");
  }
  let window: DateWindow | undefined;
  try {
    window =
      parseDateWindow(ctx.url.searchParams.get("from"), ctx.url.searchParams.get("to")) ??
      undefined;
  } catch {
    throw new HttpError(400, "Fenêtre de dates invalide.");
  }
  const ranking = await buildLeaderboard(ctx, groupId, window);
  return json(ctx.request, ctx.env, { leaderboard: ranking });
}

async function dashboard(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const now = new Date().toISOString();
  // On récupère une fenêtre de matchs à venir, suffisante pour couvrir la
  // prochaine « session » (soirée + matchs de nuit) et les prochains matchs
  // affichés. La session est ensuite découpée en JS pour englober les matchs de
  // nuit qui franchissent minuit (voir prediction-session.ts).
  const upcomingResponse = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     WHERE matches.kickoff_at >= ?
     ORDER BY matches.kickoff_at ASC
     LIMIT 20`
  )
    .bind(user.id, now)
    .all<Record<string, unknown>>();
  const upcomingRows = (upcomingResponse.results ?? []) as Array<
    Record<string, unknown> & { kickoff_at: string }
  >;
  const nextMatchesRows = upcomingRows.slice(0, 6);
  const predictionSessionRows = selectPredictionSession(upcomingRows);
  const predictionDay = predictionSessionRows.length
    ? String(predictionSessionRows[0].kickoff_at).slice(0, 10)
    : null;
  const lastResultRow = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     WHERE matches.status IN ('FINISHED', 'AWARDED')
     ORDER BY matches.kickoff_at DESC
     LIMIT 1`
  )
    .bind(user.id)
    .first<Record<string, unknown>>();
  const leaderboardData = await buildLeaderboard(ctx);
  const activity = await ctx.env.DB.prepare(
    `SELECT activity_feed.*, users.pseudo
     FROM activity_feed
     LEFT JOIN users ON users.id = activity_feed.user_id
     ORDER BY activity_feed.created_at DESC
     LIMIT 8`
  ).all();
  const rank = leaderboardData.find((row) => row.userId === user.id);

  return json(ctx.request, ctx.env, {
    nextMatches: nextMatchesRows.map((row) =>
      publicMatchFromJoinedRow(row, user.id)
    ),
    predictionDay,
    predictionDayMatches: predictionSessionRows.map((row) =>
      publicMatchFromJoinedRow(row, user.id)
    ),
    lastResult: lastResultRow ? publicMatchFromJoinedRow(lastResultRow, user.id) : null,
    rank,
    activity: activity.results ?? [],
    syncStatus: await getFootballDataSyncStatus(ctx.env)
  });
}

async function results(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     WHERE matches.status IN ('FINISHED', 'AWARDED')
     ORDER BY matches.kickoff_at DESC`
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return json(ctx.request, ctx.env, {
    results: (rows.results ?? []).map((row) => {
      const match = row as unknown as MatchRow;
      const prediction = row.prediction_id
        ? ({
            id: row.prediction_id,
            user_id: user.id,
            match_id: match.id,
            predicted_home_score: row.predicted_home_score,
            predicted_away_score: row.predicted_away_score,
            predicted_winner_team: row.predicted_winner_team,
            predicted_winner_code: row.predicted_winner_code,
            points: row.points,
            exact_score: row.exact_score,
            correct_result: row.correct_result,
            correct_goal_diff: row.correct_goal_diff,
            created_at: row.prediction_created_at,
            updated_at: row.prediction_updated_at
          } as PredictionRow)
        : null;
      return publicMatch(match, prediction);
    })
  });
}

// Arbre de la phase finale : tous les matchs a elimination directe, quel que
// soit leur statut (a venir, en cours ou termines), pour afficher la structure
// complete 16es -> finale. Contrairement a `results` (matchs termines), on ne
// filtre pas sur le statut ; le tri par tour est fait cote client.
async function bracket(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const rows = await ctx.env.DB.prepare(
    `SELECT matches.*, predictions.id AS prediction_id,
            predictions.predicted_home_score, predictions.predicted_away_score,
            predictions.predicted_winner_team, predictions.predicted_winner_code,
            predictions.points, predictions.exact_score, predictions.correct_result,
            predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
            predictions.updated_at AS prediction_updated_at
     FROM matches
     LEFT JOIN predictions
       ON predictions.match_id = matches.id AND predictions.user_id = ?
     ORDER BY matches.kickoff_at ASC`
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  const matches = (rows.results ?? [])
    .filter((row) => getStageKind(String(row.stage)) === "KNOCKOUT")
    .map((row) => publicMatchFromJoinedRow(row, user.id));

  return json(ctx.request, ctx.env, { matches });
}

async function syncNow(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  const auth = ctx.request.headers.get("authorization");
  const isAdmin = Boolean(ctx.env.ADMIN_TOKEN) && auth === `Bearer ${ctx.env.ADMIN_TOKEN}`;
  if (ctx.env.ADMIN_TOKEN && !isAdmin) {
    // Un token admin existe mais le header ne correspond pas : on exige quand
    // même un utilisateur connecté (le bouton dashboard reste utilisable).
    requireUser(ctx);
  } else if (!ctx.env.ADMIN_TOKEN) {
    requireUser(ctx);
  }

  // Protection du quota football-data : on ignore les synchros rapprochées
  // déclenchées par les utilisateurs (le cron et l'admin ne sont pas limités).
  if (!isAdmin) {
    const status = await getFootballDataSyncStatus(ctx.env);
    if (shouldThrottleSync(status)) {
      return json(ctx.request, ctx.env, {
        synced: status.lastSyncedMatches,
        status,
        throttled: true
      });
    }
  }

  return json(ctx.request, ctx.env, await syncFootballData(ctx.env));
}

async function syncStatus(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  requireUser(ctx);
  return json(ctx.request, ctx.env, {
    syncStatus: await getFootballDataSyncStatus(ctx.env)
  });
}

export async function route(ctx: RequestContext): Promise<Response> {
  const { pathname } = ctx.url;
  if (pathname === "/api/health") {
    return json(ctx.request, ctx.env, { ok: true });
  }
  if (pathname === "/api/auth/register") return register(ctx);
  if (pathname === "/api/auth/login") return login(ctx);
  if (pathname === "/api/auth/logout") return logout(ctx);
  if (pathname === "/api/me") return me(ctx);
  if (pathname === "/api/profile/pin") return changePin(ctx);
  if (pathname === "/api/profile") {
    return ctx.request.method === "GET" ? getProfile(ctx) : saveProfile(ctx);
  }
  if (pathname === "/api/notifications") {
    return ctx.request.method === "GET" ? getNotifications(ctx) : saveNotifications(ctx);
  }
  if (pathname === "/api/notifications/verify") return verifyNotifications(ctx);
  if (pathname === "/api/notifications/unsubscribe") return unsubscribeNotifications(ctx);
  if (/^\/api\/users\/[^/]+\/profile$/.test(pathname)) return getPublicUserProfile(ctx);
  if (pathname === "/api/groups") {
    return ctx.request.method === "GET" ? listGroups(ctx) : createGroup(ctx);
  }
  if (pathname === "/api/groups/join-by-code") return joinGroupByCode(ctx);
  const groupDeleteMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (groupDeleteMatch && ctx.request.method === "DELETE") return deleteGroup(ctx, groupDeleteMatch[1]);
  const groupJoinMatch = pathname.match(/^\/api\/groups\/([^/]+)\/join$/);
  if (groupJoinMatch) return joinGroup(ctx, groupJoinMatch[1]);
  const groupLeaveMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
  if (groupLeaveMatch) return leaveGroup(ctx, groupLeaveMatch[1]);
  const groupMemberMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (groupMemberMatch) return removeGroupMember(ctx, groupMemberMatch[1], groupMemberMatch[2]);
  if (pathname === "/api/dashboard") return dashboard(ctx);
  if (pathname === "/api/matches") return listMatches(ctx);
  if (pathname.startsWith("/api/predictions/")) return savePrediction(ctx);
  if (pathname === "/api/leaderboard") return leaderboard(ctx);
  if (pathname === "/api/results") return results(ctx);
  if (pathname === "/api/bracket") return bracket(ctx);
  if (pathname === "/api/admin/sync") return syncNow(ctx);
  if (pathname === "/api/sync/status") return syncStatus(ctx);
  throw new HttpError(404, "Route introuvable.");
}
