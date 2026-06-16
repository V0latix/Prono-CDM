import type { Env } from "./types";

// Faux D1 *avec etat partage* pour les tests d'integration (parcours complet
// inscription -> prono -> score -> classement) et les tests de routes qui
// persistent puis relisent. Contrairement aux mocks par requete des autres
// suites, celui-ci garde les lignes en memoire pour qu'une ecriture soit visible
// par les lectures suivantes (et par les vraies fonctions metier comme
// recalculateAllPoints / buildLeaderboard).
//
// Ce n'est PAS un moteur SQL : chaque requete reellement emise par le code de
// prod est reconnue par un fragment distinctif puis executee a la main sur des
// tableaux JS. Si une nouvelle requete apparait dans un chemin teste, il faut
// l'ajouter ici (le `throw` final l'expose plutot que de renvoyer du vide).

type Row = Record<string, unknown>;

export type MemorySeed = {
  matches?: Row[];
  users?: Row[];
  predictions?: Row[];
  user_profiles?: Row[];
  settings?: Row[];
};

type Tables = {
  users: Row[];
  sessions: Row[];
  matches: Row[];
  predictions: Row[];
  user_profiles: Row[];
  settings: Row[];
  activity_feed: Row[];
};

export type MemoryDb = {
  env: Env;
  tables: Tables;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isFinishedStatus(status: unknown): boolean {
  return status === "FINISHED" || status === "AWARDED";
}

export type MemoryDbOptions = {
  // En mode lenient, toute requete de *lecture* non reconnue renvoie un resultat
  // vide au lieu de lever. Utile pour tester un handler dont on ne veut verifier
  // qu'une partie (ex: saveProfile) sans modeliser tout le fan-out de lectures
  // annexes (badges, groupes). Les ecritures non reconnues levent toujours.
  // Les tests d'integration de bout en bout restent en mode strict (defaut).
  lenient?: boolean;
};

export function createMemoryDb(
  seed: MemorySeed = {},
  options: MemoryDbOptions = {}
): MemoryDb {
  const tables: Tables = {
    users: [...(seed.users ?? [])],
    sessions: [],
    matches: [...(seed.matches ?? [])],
    predictions: [...(seed.predictions ?? [])],
    user_profiles: [...(seed.user_profiles ?? [])],
    settings: [...(seed.settings ?? [])],
    activity_feed: []
  };

  function exec(sql: string, args: unknown[]): { results: Row[]; first: Row | null } {
    const rows = (results: Row[]) => ({ results, first: results[0] ?? null });
    const none = { results: [] as Row[], first: null };
    const has = (fragment: string) => sql.includes(fragment);

    // --- users ---------------------------------------------------------------
    if (has("SELECT id FROM users WHERE pseudo")) {
      const key = String(args[0] ?? "").toLowerCase();
      const user = tables.users.find((u) => String(u.pseudo).toLowerCase() === key);
      return rows(user ? [{ id: user.id }] : []);
    }
    if (has("INSERT INTO users")) {
      tables.users.push({
        id: args[0],
        pseudo: args[1],
        pin_hash: args[2],
        created_at: nowIso()
      });
      return none;
    }

    // --- sessions ------------------------------------------------------------
    if (has("INSERT INTO sessions")) {
      tables.sessions.push({
        id: args[0],
        user_id: args[1],
        token_hash: args[2],
        expires_at: args[3]
      });
      return none;
    }
    if (has("FROM sessions") && has("JOIN users")) {
      const tokenHash = args[0];
      const now = String(args[1] ?? nowIso());
      const session = tables.sessions.find(
        (s) => s.token_hash === tokenHash && String(s.expires_at) > now
      );
      if (!session) return none;
      const user = tables.users.find((u) => u.id === session.user_id);
      return rows(
        user ? [{ id: user.id, pseudo: user.pseudo, created_at: user.created_at }] : []
      );
    }

    // --- matches -------------------------------------------------------------
    if (has("SELECT * FROM matches WHERE id")) {
      const match = tables.matches.find((m) => m.id === args[0]);
      return rows(match ? [match] : []);
    }
    if (has("SELECT id FROM matches WHERE status IN")) {
      const finished = tables.matches
        .filter((m) => isFinishedStatus(m.status))
        .sort((a, b) => String(b.kickoff_at).localeCompare(String(a.kickoff_at)));
      return rows(finished[0] ? [{ id: finished[0].id }] : []);
    }

    // --- predictions ---------------------------------------------------------
    if (has("INSERT INTO predictions")) {
      const [id, userId, matchId, phs, pas, pwt, pwc, createdAt, updatedAt] = args;
      const existing = tables.predictions.find(
        (p) => p.user_id === userId && p.match_id === matchId
      );
      if (existing) {
        Object.assign(existing, {
          predicted_home_score: phs,
          predicted_away_score: pas,
          predicted_winner_team: pwt,
          predicted_winner_code: pwc,
          updated_at: updatedAt
        });
      } else {
        tables.predictions.push({
          id,
          user_id: userId,
          match_id: matchId,
          predicted_home_score: phs,
          predicted_away_score: pas,
          predicted_winner_team: pwt,
          predicted_winner_code: pwc,
          points: 0,
          exact_score: 0,
          correct_result: 0,
          correct_goal_diff: 0,
          created_at: createdAt,
          updated_at: updatedAt
        });
      }
      return none;
    }
    if (has("UPDATE predictions") && has("SET points")) {
      const [points, exact, correct, diff, id] = args;
      const prediction = tables.predictions.find((p) => p.id === id);
      if (prediction) {
        Object.assign(prediction, {
          points,
          exact_score: exact,
          correct_result: correct,
          correct_goal_diff: diff
        });
      }
      return none;
    }
    if (has("SELECT * FROM predictions WHERE user_id")) {
      const prediction = tables.predictions.find(
        (p) => p.user_id === args[0] && p.match_id === args[1]
      );
      return rows(prediction ? [prediction] : []);
    }
    // recalculateAllPoints : predictions JOIN matches JOIN users
    if (has("FROM predictions") && has("matches.home_team") && has("JOIN users")) {
      return rows(
        tables.predictions.flatMap((p) => {
          const match = tables.matches.find((m) => m.id === p.match_id);
          const user = tables.users.find((u) => u.id === p.user_id);
          if (!match || !user) return [];
          return [
            {
              ...p,
              pseudo: user.pseudo,
              home_team: match.home_team,
              away_team: match.away_team,
              home_score: match.home_score,
              away_score: match.away_score,
              stage: match.stage,
              winner_code: match.winner_code,
              status: match.status
            }
          ];
        })
      );
    }
    // recordStreakActivity : users JOIN predictions JOIN matches (finis)
    if (
      has("FROM users") &&
      has("JOIN predictions") &&
      has("matches.kickoff_at") &&
      has("matches.status IN")
    ) {
      const result = tables.predictions
        .flatMap((p) => {
          const match = tables.matches.find((m) => m.id === p.match_id);
          const user = tables.users.find((u) => u.id === p.user_id);
          if (!match || !user || !isFinishedStatus(match.status)) return [];
          return [
            {
              user_id: user.id,
              pseudo: user.pseudo,
              match_id: p.match_id,
              exact_score: p.exact_score,
              correct_result: p.correct_result,
              kickoff_at: match.kickoff_at
            }
          ];
        })
        .sort(
          (a, b) =>
            String(a.user_id).localeCompare(String(b.user_id)) ||
            String(b.kickoff_at).localeCompare(String(a.kickoff_at))
        );
      return rows(result);
    }
    // buildLeaderboard : predictions JOIN matches (stage/status/kickoff)
    if (has("FROM predictions") && has("matches.stage") && has("matches.status")) {
      return rows(
        tables.predictions.flatMap((p) => {
          const match = tables.matches.find((m) => m.id === p.match_id);
          if (!match) return [];
          return [
            { ...p, stage: match.stage, status: match.status, kickoff_at: match.kickoff_at }
          ];
        })
      );
    }

    // --- leader aggregate (recordLeaderActivity) -----------------------------
    if (has("FROM users") && has("LEFT JOIN predictions") && has("GROUP BY")) {
      const ranked = tables.users
        .map((user) => {
          const preds = tables.predictions.filter((p) => p.user_id === user.id);
          return {
            user_id: user.id,
            pseudo: user.pseudo,
            points: preds.reduce((sum, p) => sum + Number(p.points ?? 0), 0),
            exact_scores: preds.filter((p) => p.exact_score).length,
            correct_results: preds.filter((p) => p.correct_result && !p.exact_score).length,
            goal_diffs: preds.filter((p) => p.correct_goal_diff && !p.exact_score).length
          };
        })
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.exact_scores - a.exact_scores ||
            b.correct_results - a.correct_results ||
            b.goal_diffs - a.goal_diffs ||
            String(a.pseudo).localeCompare(String(b.pseudo))
        );
      return rows(ranked[0] ? [ranked[0]] : []);
    }

    // --- leaderboard users (users LEFT JOIN user_profiles) -------------------
    if (has("FROM users") && has("LEFT JOIN user_profiles")) {
      const result = [...tables.users]
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((user) => {
          const profile = tables.user_profiles.find((p) => p.user_id === user.id);
          return {
            id: user.id,
            pseudo: user.pseudo,
            created_at: user.created_at,
            photo_url: profile?.photo_url ?? null,
            tagline: profile?.tagline ?? null,
            favorite_team: profile?.favorite_team ?? null
          };
        });
      return rows(result);
    }

    // --- settings ------------------------------------------------------------
    if (has("FROM settings") && has("WHERE key =")) {
      // Cle litterale dans le SQL (key = '...') ou liee (key = ?).
      const key = sql.match(/key = '([^']+)'/)?.[1] ?? args[0];
      const setting = tables.settings.find((s) => s.key === key);
      return rows(setting ? [{ value: setting.value }] : []);
    }
    if (has("FROM settings") && has("WHERE key IN")) {
      return rows(tables.settings.map((s) => ({ key: s.key, value: s.value })));
    }
    if (has("INSERT INTO settings")) {
      const [key, value] = args;
      const existing = tables.settings.find((s) => s.key === key);
      if (existing) existing.value = value;
      else tables.settings.push({ key, value });
      return none;
    }

    // --- activity feed -------------------------------------------------------
    if (has("INSERT OR IGNORE INTO activity_feed")) {
      // VALUES (?, 'exact_score', ?, ?, ?) ou (?, ?, ?, ?, ?)
      const literalType = sql.match(/VALUES \(\?, '([^']+)'/)?.[1];
      const type = literalType ?? args[1];
      const userId = literalType ? args[1] : args[2];
      const matchId = literalType ? args[2] : args[3];
      const message = literalType ? args[3] : args[4];
      const duplicate = tables.activity_feed.some(
        (a) => a.type === type && a.user_id === userId && a.match_id === matchId
      );
      if (!duplicate) {
        tables.activity_feed.push({ id: args[0], type, user_id: userId, match_id: matchId, message });
      }
      return none;
    }

    // --- user_profiles -------------------------------------------------------
    if (has("INSERT INTO user_profiles")) {
      const [userId, photoUrl, tagline, favoriteTeam] = args;
      const existing = tables.user_profiles.find((p) => p.user_id === userId);
      if (existing) {
        Object.assign(existing, {
          photo_url: photoUrl,
          tagline,
          favorite_team: favoriteTeam,
          updated_at: nowIso()
        });
      } else {
        tables.user_profiles.push({
          user_id: userId,
          photo_url: photoUrl,
          tagline,
          favorite_team: favoriteTeam,
          updated_at: nowIso()
        });
      }
      return none;
    }
    if (has("SELECT * FROM user_profiles WHERE user_id")) {
      const profile = tables.user_profiles.find((p) => p.user_id === args[0]);
      return rows(profile ? [profile] : []);
    }

    if (options.lenient) {
      const head = sql.trimStart().slice(0, 6).toUpperCase();
      if (head === "SELECT" || sql.includes("PRAGMA")) return none;
    }

    throw new Error(`Requete non geree par le faux D1: ${sql}`);
  }

  function prepare(sql: string) {
    const statement = {
      _args: [] as unknown[],
      bind(...args: unknown[]) {
        return { ...statement, _args: args };
      },
      async first<T>() {
        return exec(sql, this._args).first as T | null;
      },
      async all<T>() {
        return { results: exec(sql, this._args).results as T[] };
      },
      async run() {
        exec(sql, this._args);
        return { success: true };
      }
    };
    return statement;
  }

  const db = {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const out = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    }
  };

  return {
    env: { DB: db } as unknown as Env,
    tables
  };
}
