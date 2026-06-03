import {
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Heart,
  Lock,
  LogOut,
  Medal,
  RefreshCw,
  Scale,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type ActivityItem,
  type LeaderboardRow,
  type Match,
  type Profile as UserProfile,
  type SyncStatus,
  type User
} from "./api";

type View = "dashboard" | "predictions" | "leaderboard" | "results" | "rules" | "profile";

type DashboardData = {
  nextMatches: Match[];
  predictionDay: string | null;
  predictionDayMatches: Match[];
  rank?: LeaderboardRow;
  activity: ActivityItem[];
  syncStatus: SyncStatus;
};

const navItems: Array<{ id: View; label: string; icon: typeof CalendarClock }> = [
  { id: "dashboard", label: "Dashboard", icon: CalendarClock },
  { id: "predictions", label: "Mes pronos", icon: ClipboardList },
  { id: "leaderboard", label: "Classement", icon: Trophy },
  { id: "results", label: "Résultats", icon: Medal },
  { id: "rules", label: "Règlement", icon: Scale }
];

const viewTitles: Record<View, string> = {
  dashboard: "Dashboard",
  predictions: "Mes pronos",
  leaderboard: "Classement",
  results: "Résultats",
  rules: "Règlement",
  profile: "Profil"
};

const defaultProfile: UserProfile = {
  photoUrl: "",
  tagline: "Prêt à viser le score exact.",
  favoriteTeam: "France",
  favoriteMatchId: "",
  matchHype: 75,
  updatedAt: null
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function stageLabel(match: Match): string {
  if (match.stageKind === "KNOCKOUT") return "Élimination directe";
  return "Groupes";
}

function scoreLabel(match: Match): string {
  if (match.homeScore === null || match.awayScore === null) return "-";
  return `${match.homeScore} - ${match.awayScore}`;
}

function syncStatusLabel(status: SyncStatus["status"]): string {
  if (status === "success") return "Synchronisé";
  if (status === "running") return "Synchronisation en cours";
  if (status === "failed") return "Erreur API";
  if (status === "missing_token") return "Clé API manquante";
  return "Jamais synchronisé";
}

function initials(pseudo: string): string {
  return pseudo.slice(0, 2).toUpperCase();
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    api<{ user: User | null }>("/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return <ShellState label="Chargement de la session..." />;
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">26</div>
          <div>
            <strong>Prono CDM</strong>
            <span>Ligue privée</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Navigation principale">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          className="logout-button"
          type="button"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            setUser(null);
          }}
        >
          <LogOut size={18} />
          Déconnexion
        </button>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <p>Coupe du monde 2026</p>
            <h1>{viewTitles[view]}</h1>
          </div>
          <button className="user-pill" type="button" onClick={() => setView("profile")}>
            <UserRound size={18} />
            {user.pseudo}
          </button>
        </header>
        {view === "dashboard" && <Dashboard onOpenPredictions={() => setView("predictions")} />}
        {view === "predictions" && <Predictions />}
        {view === "leaderboard" && <Leaderboard currentUser={user} />}
        {view === "results" && <Results />}
        {view === "rules" && <Rules />}
        {view === "profile" && <Profile user={user} />}
      </main>
    </div>
  );
}

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [pseudo, setPseudo] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user: User }>(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ pseudo, pin })
        }
      );
      onAuth(data.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel">
        <div className="brand compact">
          <div className="brand-mark">26</div>
          <div>
            <strong>Prono CDM</strong>
            <span>Entre amis</span>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="segmented">
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Inscription
            </button>
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Connexion
            </button>
          </div>
          <label>
            Pseudo
            <input
              value={pseudo}
              onChange={(event) => setPseudo(event.target.value)}
              autoComplete="username"
              required
              minLength={2}
              maxLength={32}
            />
          </label>
          <label>
            Code PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              inputMode="numeric"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={4}
              maxLength={8}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            <ShieldCheck size={18} />
            {loading ? "Validation..." : mode === "register" ? "Créer mon compte" : "Me connecter"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Dashboard({ onOpenPredictions }: { onOpenPredictions: () => void }) {
  const { data, error, reload, loading } = useResource<DashboardData>("/api/dashboard");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  async function runSync() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const result = await api<{ synced: number; error?: string }>("/api/admin/sync", {
        method: "POST"
      });
      setSyncMessage(
        result.error
          ? result.error
          : `${result.synced} match${result.synced > 1 ? "s" : ""} synchronisé${result.synced > 1 ? "s" : ""}.`
      );
      await reload();
    } catch (syncError) {
      setSyncMessage(
        syncError instanceof Error ? syncError.message : "Erreur de synchronisation."
      );
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <ShellState label="Chargement du dashboard..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const pendingPredictionCount = data.predictionDayMatches.filter(
    (match) => !match.locked && !match.prediction
  ).length;

  return (
    <div className="view-grid">
      <section className="summary-strip">
        <Metric label="Rang" value={data.rank ? `#${data.rank.rank}` : "-"} />
        <Metric label="Points" value={String(data.rank?.points ?? 0)} />
        <Metric label="Scores exacts" value={String(data.rank?.exactScores ?? 0)} />
      </section>
      <section className="content-section">
        <SectionTitle
          title="Données matchs"
          action={
            <button
              className="secondary-button"
              type="button"
              onClick={runSync}
              disabled={syncing}
            >
              <RefreshCw size={16} />
              {syncing ? "Synchronisation..." : "Synchroniser"}
            </button>
          }
        />
        <div className="sync-grid">
          <SyncStat label="État" value={syncStatusLabel(data.syncStatus.status)} />
          <SyncStat
            label="Dernière réussite"
            value={
              data.syncStatus.lastSuccessAt
                ? formatDate(data.syncStatus.lastSuccessAt)
                : "-"
            }
          />
          <SyncStat label="Matchs importés" value={String(data.syncStatus.lastSyncedMatches)} />
        </div>
        {data.syncStatus.lastError && (
          <p className="form-error sync-error">{data.syncStatus.lastError}</p>
        )}
        {syncMessage && <p className="inline-message">{syncMessage}</p>}
      </section>
      <section className="content-section dashboard-block-attention">
        <SectionTitle
          title="Prédictions à faire maintenant"
          action={
            <button className="secondary-button" type="button" onClick={onOpenPredictions}>
              <ClipboardList size={16} />
              Mes pronos
            </button>
          }
        />
        {data.predictionDay ? (
          <p className="section-subtitle">
            Prochain jour de compétition : {formatDay(data.predictionDay)} · {pendingPredictionCount} à compléter
          </p>
        ) : null}
        {data.predictionDayMatches.length === 0 ? (
          <EmptyState text="Aucun match futur synchronisé pour le moment." />
        ) : (
          <div className="match-list">
            {data.predictionDayMatches.map((match) => (
              <MatchLine key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>
      <section className="content-section">
        <SectionTitle title="Prochains matchs" action={<RefreshButton onClick={reload} />} />
        {data.nextMatches.length === 0 ? (
          <EmptyState text="Aucun match synchronisé pour le moment." />
        ) : (
          <div className="match-list">
            {data.nextMatches.map((match) => (
              <MatchLine key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>
      <section className="content-section">
        <SectionTitle title="Activité" />
        {data.activity.length === 0 ? (
          <EmptyState text="Le feed s'animera après les premiers résultats." />
        ) : (
          <div className="activity-list">
            {data.activity.map((item) => (
              <div key={item.id} className="activity-item">
                <Check size={16} />
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Predictions() {
  const { data, error, reload, loading } = useResource<{ matches: Match[] }>("/api/matches");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function save(match: Match, homeScore: number, awayScore: number, winnerTeam: string | null) {
    setSavingId(match.id);
    setMessage("");
    try {
      await api(`/api/predictions/${match.id}`, {
        method: "PUT",
        body: JSON.stringify({
          predictedHomeScore: homeScore,
          predictedAwayScore: awayScore,
          predictedWinnerTeam: winnerTeam
        })
      });
      await reload();
      setMessage("Prono enregistré.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Erreur d'enregistrement.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <ShellState label="Chargement des matchs..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <section className="content-section">
      <SectionTitle title="Tous les matchs" action={<RefreshButton onClick={reload} />} />
      {message && <p className="inline-message">{message}</p>}
      {data?.matches.length ? (
        <div className="prediction-list">
          {data.matches.map((match) => (
            <PredictionEditor
              key={match.id}
              match={match}
              saving={savingId === match.id}
              onSave={save}
            />
          ))}
        </div>
      ) : (
        <EmptyState text="Lance une première synchro pour remplir le calendrier." />
      )}
    </section>
  );
}

function PredictionEditor({
  match,
  saving,
  onSave
}: {
  match: Match;
  saving: boolean;
  onSave: (match: Match, home: number, away: number, winnerTeam: string | null) => void;
}) {
  const [home, setHome] = useState(match.prediction?.predictedHomeScore ?? 0);
  const [away, setAway] = useState(match.prediction?.predictedAwayScore ?? 0);
  const [winnerTeam, setWinnerTeam] = useState<string | null>(
    match.prediction?.predictedWinnerTeam ?? null
  );
  const tiedKnockout = match.stageKind === "KNOCKOUT" && home === away;

  useEffect(() => {
    setHome(match.prediction?.predictedHomeScore ?? 0);
    setAway(match.prediction?.predictedAwayScore ?? 0);
    setWinnerTeam(match.prediction?.predictedWinnerTeam ?? null);
  }, [match]);

  return (
    <article className="prediction-row">
      <MatchLine match={match} compact />
      <div className="score-editor">
        <input
          aria-label={`Score ${match.homeTeam}`}
          type="number"
          min={0}
          max={30}
          value={home}
          disabled={match.locked}
          onChange={(event) => setHome(Number(event.target.value))}
        />
        <span>-</span>
        <input
          aria-label={`Score ${match.awayTeam}`}
          type="number"
          min={0}
          max={30}
          value={away}
          disabled={match.locked}
          onChange={(event) => setAway(Number(event.target.value))}
        />
        {tiedKnockout && (
          <select
            value={winnerTeam ?? ""}
            disabled={match.locked}
            onChange={(event) => setWinnerTeam(event.target.value || null)}
          >
            <option value="">Qualifié</option>
            <option value={match.homeTeam}>{match.homeTeam}</option>
            <option value={match.awayTeam}>{match.awayTeam}</option>
          </select>
        )}
        <button
          type="button"
          disabled={match.locked || saving || (tiedKnockout && !winnerTeam)}
          onClick={() => onSave(match, home, away, tiedKnockout ? winnerTeam : null)}
        >
          {match.locked ? <Lock size={16} /> : <Check size={16} />}
          {match.locked ? "Verrouillé" : saving ? "..." : "Enregistrer"}
        </button>
      </div>
    </article>
  );
}

function Leaderboard({ currentUser }: { currentUser: User }) {
  const [phase, setPhase] = useState("general");
  const { data, error, reload, loading } = useResource<{ leaderboard: LeaderboardRow[] }>(
    `/api/leaderboard?phase=${phase}`,
    [phase]
  );

  if (loading) return <ShellState label="Calcul du classement..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <section className="content-section">
      <SectionTitle title="Classement général" action={<RefreshButton onClick={reload} />} />
      <div className="segmented compact-tabs">
        {[
          ["general", "Général"],
          ["groups", "Groupes"],
          ["knockout", "Élimination"]
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={phase === id ? "active" : ""}
            onClick={() => setPhase(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="leaderboard-table">
        {data?.leaderboard.map((row) => (
          <div
            key={row.userId}
            className={row.userId === currentUser.id ? "leaderboard-row me" : "leaderboard-row"}
          >
            <span className="rank">#{row.rank}</span>
            <strong>{row.pseudo}</strong>
            <span>{row.points} pts</span>
            <span>{row.exactScores} exacts</span>
            <span>{row.correctResults} bons résultats</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Results() {
  const { data, error, reload, loading } = useResource<{ results: Match[] }>("/api/results");
  if (loading) return <ShellState label="Chargement des résultats..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <section className="content-section">
      <SectionTitle title="Matchs terminés" action={<RefreshButton onClick={reload} />} />
      {data?.results.length ? (
        <div className="match-list">
          {data.results.map((match) => (
            <MatchLine key={match.id} match={match} showResult />
          ))}
        </div>
      ) : (
        <EmptyState text="Aucun résultat disponible. Le plan gratuit football-data.org peut être différé." />
      )}
    </section>
  );
}

function Profile({ user }: { user: User }) {
  const matchesResource = useResource<{ matches: Match[] }>("/api/matches");
  const profileResource = useResource<{ profile: UserProfile }>("/api/profile", [user.id]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const favoriteMatch = matchesResource.data?.matches.find(
    (match) => match.id === profile.favoriteMatchId
  );

  useEffect(() => {
    if (profileResource.data?.profile) {
      setProfile({ ...defaultProfile, ...profileResource.data.profile });
    }
    setSaved(false);
    setSaveError("");
  }, [profileResource.data]);

  function updateProfile(update: Partial<UserProfile>) {
    setProfile((current) => ({ ...current, ...update }));
    setSaved(false);
    setSaveError("");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    setSaved(false);
    try {
      const response = await api<{ profile: UserProfile }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          photoUrl: profile.photoUrl,
          tagline: profile.tagline,
          favoriteTeam: profile.favoriteTeam,
          favoriteMatchId: profile.favoriteMatchId || null,
          matchHype: profile.matchHype
        })
      });
      setProfile({ ...defaultProfile, ...response.profile });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Impossible d'enregistrer le profil.");
    }
  }

  if (profileResource.loading) return <ShellState label="Chargement du profil..." />;
  if (profileResource.error) {
    return <ErrorState error={profileResource.error} onRetry={profileResource.reload} />;
  }

  return (
    <div className="profile-layout">
      <section className="content-section profile-hero">
        <div className="profile-photo-frame">
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt={`Photo de ${user.pseudo}`} />
          ) : (
            <span>{initials(user.pseudo)}</span>
          )}
        </div>
        <div className="profile-intro">
          <span className="eyebrow">Profil joueur</span>
          <h2>{user.pseudo}</h2>
          <p>{profile.tagline || defaultProfile.tagline}</p>
          <div className="profile-chips">
            <span>
              <Star size={16} />
              Favori : {profile.favoriteTeam || "Non renseigné"}
            </span>
            <span>
              <Heart size={16} />
              Hype match : {profile.matchHype}%
            </span>
          </div>
        </div>
      </section>

      <section className="content-section">
        <SectionTitle title="Préférences" />
        <form className="profile-form" onSubmit={saveProfile}>
          <label>
            <span>
              <Camera size={16} />
              Photo
            </span>
            <input
              value={profile.photoUrl}
              onChange={(event) => updateProfile({ photoUrl: event.target.value })}
              placeholder="https://..."
              type="url"
            />
          </label>
          <label>
            <span>
              <Sparkles size={16} />
              Phrase d'accroche
            </span>
            <input
              value={profile.tagline}
              onChange={(event) => updateProfile({ tagline: event.target.value })}
              maxLength={90}
              placeholder="Ex: le roi du nul 1-1"
            />
          </label>
          <label>
            <span>
              <Star size={16} />
              Favori de la compétition
            </span>
            <input
              value={profile.favoriteTeam}
              onChange={(event) => updateProfile({ favoriteTeam: event.target.value })}
              maxLength={40}
              placeholder="France, Brésil, Argentine..."
            />
          </label>
          <label>
            <span>
              <Heart size={16} />
              Match préféré
            </span>
            <select
              value={profile.favoriteMatchId}
              onChange={(event) => updateProfile({ favoriteMatchId: event.target.value })}
              disabled={matchesResource.loading || !!matchesResource.error}
            >
              <option value="">Aucun match sélectionné</option>
              {matchesResource.data?.matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.homeTeam} - {match.awayTeam} · {formatDate(match.kickoffAt)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Barre du match préféré</span>
            <input
              type="range"
              min={0}
              max={100}
              value={profile.matchHype}
              onChange={(event) => updateProfile({ matchHype: Number(event.target.value) })}
            />
          </label>
          {matchesResource.error && (
            <ErrorState error={matchesResource.error} onRetry={matchesResource.reload} />
          )}
          {saveError && <p className="form-error">{saveError}</p>}
          <button className="primary-button" type="submit">
            <Save size={18} />
            Enregistrer mon profil
          </button>
          {saved && <p className="inline-message">Profil enregistré.</p>}
        </form>
      </section>

      <section className="content-section">
        <SectionTitle title="Match préféré" />
        {favoriteMatch ? (
          <div className="favorite-match-card">
            <MatchLine match={favoriteMatch} />
            <div className="hype-meter" aria-label={`Barre du match préféré ${profile.matchHype}%`}>
              <span style={{ width: `${profile.matchHype}%` }} />
            </div>
          </div>
        ) : (
          <EmptyState text="Choisis un match préféré pour afficher ta barre ici." />
        )}
      </section>
    </div>
  );
}

function Rules() {
  return (
    <section className="content-section rules">
      <h2>Barème</h2>
      <p>Score exact : 5 points. Bon résultat : 3 points. Bon écart de buts : +1 point.</p>
      <p>
        Toute la phase à élimination directe est doublée : 10 points pour un score
        exact, 6 points pour le bon résultat, 8 points si le bon écart est aussi
        trouvé.
      </p>
      <h2>Verrouillage</h2>
      <p>
        Un prono est modifiable jusqu'à l'heure de coup d'envoi enregistrée en base.
        Le Worker refuse toute écriture après cette heure.
      </p>
      <h2>Élimination directe</h2>
      <p>
        Quand football-data.org fournit le vainqueur qualifié, le bon résultat est
        calculé sur cette équipe. Si cette donnée manque, l'app utilise le score
        final disponible comme hypothèse.
      </p>
      <h2>Scores</h2>
      <p>
        Le plan gratuit football-data.org peut livrer les scores avec retard. Le
        classement se met à jour à la prochaine synchronisation disponible.
      </p>
    </section>
  );
}

function MatchLine({
  match,
  compact = false,
  showResult = false
}: {
  match: Match;
  compact?: boolean;
  showResult?: boolean;
}) {
  return (
    <article className={compact ? "match-line compact" : "match-line"}>
      <div>
        <span className="eyebrow">{stageLabel(match)} · {formatDate(match.kickoffAt)}</span>
        <strong>{match.homeTeam} - {match.awayTeam}</strong>
      </div>
      <div className="match-meta">
        {showResult && <span className="score-badge">{scoreLabel(match)}</span>}
        {match.prediction ? (
          <span className="status-chip success">
            {match.prediction.predictedHomeScore}-{match.prediction.predictedAwayScore}
            {showResult ? ` · ${match.prediction.points} pts` : ""}
          </span>
        ) : (
          <span className="status-chip">Sans prono</span>
        )}
        {match.locked && <Lock size={16} />}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SyncStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sync-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button" type="button" onClick={onClick} title="Rafraîchir">
      <RefreshCw size={17} />
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="empty-state error-state">
      <span>{error}</span>
      <button type="button" onClick={onRetry}>Réessayer</button>
    </div>
  );
}

function ShellState({ label }: { label: string }) {
  return <div className="shell-state">{label}</div>;
}

function useResource<T>(path: string, deps: Array<unknown> = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const stableDeps = useMemo(() => deps, deps);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api<T>(path));
    } catch (resourceError) {
      setError(
        resourceError instanceof Error ? resourceError.message : "Erreur inconnue."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [path, ...stableDeps]);

  return { data, error, loading, reload: load };
}
