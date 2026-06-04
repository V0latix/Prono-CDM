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
  hashPin,
  normalizePseudo,
  normalizePseudoKey,
  serializeSessionCookie,
  validatePin,
  verifyPin
} from "./auth";
import { getUserBadges } from "./badges";
import { getFootballDataSyncStatus, syncFootballData } from "./football-data";
import { HttpError, json, parseJson, requireUser, type RequestContext } from "./http";
import type { GroupMemberRow, GroupRow, MatchRow, PredictionRow, User, UserProfileRow } from "./types";

type AuthPayload = {
  pseudo?: string;
  pin?: string;
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

type GroupPayload = {
  name?: string;
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
  return {
    id: group.id,
    name: group.name,
    ownerUserId: group.owner_user_id,
    ownerPseudo: group.owner_pseudo,
    memberCount: Number(group.member_count ?? 0),
    isMember: Boolean(group.is_member),
    isOwner: group.owner_user_id === currentUserId,
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

async function getPublicGroups(
  ctx: RequestContext,
  currentUserId: string,
  options: { userId?: string; includeMembers?: boolean } = {}
): Promise<PublicGroup[]> {
  const rows = await getGroupRows(ctx, currentUserId, options.userId);
  const groups = rows.results ?? [];
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
    { user: { id: userId, pseudo } },
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

  const user = await ctx.env.DB.prepare(
    `SELECT id, pseudo, pin_hash, created_at
     FROM users
     WHERE pseudo = ? COLLATE NOCASE
     ORDER BY created_at ASC
     LIMIT 1`
  )
    .bind(pseudo)
    .first<User & { pin_hash: string }>();

  if (!user || !(await verifyPin(pin, user.pin_hash))) {
    throw new HttpError(401, "Pseudo ou PIN incorrect.");
  }

  const token = await createSession(ctx.env, user.id);
  return json(
    ctx.request,
    ctx.env,
    { user: { id: user.id, pseudo: user.pseudo, createdAt: user.created_at } },
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

async function getPublicUserProfile(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  requireUser(ctx);
  const match = ctx.url.pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
  const userId = match?.[1];
  if (!userId) throw new HttpError(400, "Utilisateur manquant.");

  const user = await ctx.env.DB.prepare(
    "SELECT id, pseudo, created_at FROM users WHERE id = ? LIMIT 1"
  )
    .bind(userId)
    .first<User>();
  if (!user) throw new HttpError(404, "Utilisateur introuvable.");

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
      "INSERT INTO prediction_groups (id, name, owner_user_id) VALUES (?, ?, ?)"
    )
      .bind(groupId, name, user.id)
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

  await ctx.env.DB.prepare(
    `INSERT INTO predictions (
       id, user_id, match_id, predicted_home_score, predicted_away_score,
       predicted_winner_team, predicted_winner_code, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       predicted_home_score = excluded.predicted_home_score,
       predicted_away_score = excluded.predicted_away_score,
       predicted_winner_team = excluded.predicted_winner_team,
       predicted_winner_code = excluded.predicted_winner_code,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      match.id,
      predictedHomeScore,
      predictedAwayScore,
      predictedWinnerTeam,
      predictedWinnerCode
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

async function buildLeaderboard(ctx: RequestContext, groupId?: string): Promise<LeaderboardRow[]> {
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
  const predictionRows = rows.results ?? [];
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
  const ranking = await buildLeaderboard(ctx, groupId);
  return json(ctx.request, ctx.env, { leaderboard: ranking });
}

async function dashboard(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "GET");
  const user = requireUser(ctx);
  const now = new Date().toISOString();
  const matchesResponse = await ctx.env.DB.prepare(
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
     LIMIT 6`
  )
    .bind(user.id, now)
    .all<Record<string, unknown>>();
  const nextCompetitionDay = await ctx.env.DB.prepare(
    `SELECT substr(kickoff_at, 1, 10) AS competition_day
     FROM matches
     WHERE kickoff_at >= ?
     ORDER BY kickoff_at ASC
     LIMIT 1`
  )
    .bind(now)
    .first<{ competition_day: string }>();
  const predictionDayResponse = nextCompetitionDay
    ? await ctx.env.DB.prepare(
        `SELECT matches.*, predictions.id AS prediction_id,
                predictions.predicted_home_score, predictions.predicted_away_score,
                predictions.predicted_winner_team, predictions.predicted_winner_code,
                predictions.points, predictions.exact_score, predictions.correct_result,
                predictions.correct_goal_diff, predictions.created_at AS prediction_created_at,
                predictions.updated_at AS prediction_updated_at
         FROM matches
         LEFT JOIN predictions
           ON predictions.match_id = matches.id AND predictions.user_id = ?
         WHERE substr(matches.kickoff_at, 1, 10) = ?
           AND matches.kickoff_at >= ?
         ORDER BY matches.kickoff_at ASC`
      )
        .bind(user.id, nextCompetitionDay.competition_day, now)
        .all<Record<string, unknown>>()
    : { results: [] };
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
    nextMatches: (matchesResponse.results ?? []).map((row) =>
      publicMatchFromJoinedRow(row, user.id)
    ),
    predictionDay: nextCompetitionDay?.competition_day ?? null,
    predictionDayMatches: (predictionDayResponse.results ?? []).map((row) =>
      publicMatchFromJoinedRow(row, user.id)
    ),
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

async function syncNow(ctx: RequestContext): Promise<Response> {
  assertMethod(ctx, "POST");
  if (ctx.env.ADMIN_TOKEN) {
    const auth = ctx.request.headers.get("authorization");
    if (auth !== `Bearer ${ctx.env.ADMIN_TOKEN}`) {
      throw new HttpError(403, "Jeton admin invalide.");
    }
  } else {
    requireUser(ctx);
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
  if (pathname === "/api/profile") {
    return ctx.request.method === "GET" ? getProfile(ctx) : saveProfile(ctx);
  }
  if (/^\/api\/users\/[^/]+\/profile$/.test(pathname)) return getPublicUserProfile(ctx);
  if (pathname === "/api/groups") {
    return ctx.request.method === "GET" ? listGroups(ctx) : createGroup(ctx);
  }
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
  if (pathname === "/api/admin/sync") return syncNow(ctx);
  if (pathname === "/api/sync/status") return syncStatus(ctx);
  throw new HttpError(404, "Route introuvable.");
}
