import {
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Lock,
  LogOut,
  Medal,
  Moon,
  RefreshCw,
  Scale,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trophy,
  UserRound
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  api,
  type ActivityItem,
  type LeaderboardRow,
  type Match,
  type Profile as UserProfile,
  type ProfileBadge,
  type ProfileStats as PublicProfileStats,
  type SyncStatus,
  type User
} from "./api";

type View = "dashboard" | "predictions" | "leaderboard" | "results" | "rules" | "profile" | "publicProfile";
type ThemeMode = "light" | "dark";

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
  profile: "Profil",
  publicProfile: "Profil joueur"
};

const defaultProfile: UserProfile = {
  photoUrl: "",
  tagline: "Prêt à viser le score exact.",
  favoriteTeam: "France",
  updatedAt: null
};
const themeStorageKey = "prono-cdm-theme";
const profilePhotoMaxSize = 520;
const profilePhotoQuality = 0.78;

const teamFlagEntries: Array<[string, string]> = [
  ["Afrique du Sud", "🇿🇦"],
  ["Albanie", "🇦🇱"],
  ["Algérie", "🇩🇿"],
  ["Allemagne", "🇩🇪"],
  ["Angleterre", "🏴"],
  ["Arabie saoudite", "🇸🇦"],
  ["Argentina", "🇦🇷"],
  ["Argentine", "🇦🇷"],
  ["Australie", "🇦🇺"],
  ["Australia", "🇦🇺"],
  ["Autriche", "🇦🇹"],
  ["Austria", "🇦🇹"],
  ["Belgique", "🇧🇪"],
  ["Belgium", "🇧🇪"],
  ["Bolivie", "🇧🇴"],
  ["Bolivia", "🇧🇴"],
  ["Brazil", "🇧🇷"],
  ["Brésil", "🇧🇷"],
  ["Cameroun", "🇨🇲"],
  ["Cameroon", "🇨🇲"],
  ["Canada", "🇨🇦"],
  ["Cap-Vert", "🇨🇻"],
  ["Cape Verde", "🇨🇻"],
  ["Chile", "🇨🇱"],
  ["Chili", "🇨🇱"],
  ["China", "🇨🇳"],
  ["Chine", "🇨🇳"],
  ["Colombia", "🇨🇴"],
  ["Colombie", "🇨🇴"],
  ["Corée du Nord", "🇰🇵"],
  ["Corée du Sud", "🇰🇷"],
  ["Costa Rica", "🇨🇷"],
  ["Côte d'Ivoire", "🇨🇮"],
  ["Cote d'Ivoire", "🇨🇮"],
  ["Croatie", "🇭🇷"],
  ["Croatia", "🇭🇷"],
  ["Danemark", "🇩🇰"],
  ["Denmark", "🇩🇰"],
  ["Ecuador", "🇪🇨"],
  ["Egypt", "🇪🇬"],
  ["Égypte", "🇪🇬"],
  ["Émirats arabes unis", "🇦🇪"],
  ["Équateur", "🇪🇨"],
  ["Espagne", "🇪🇸"],
  ["États-Unis", "🇺🇸"],
  ["England", "🏴"],
  ["France", "🇫🇷"],
  ["Georgia", "🇬🇪"],
  ["Germany", "🇩🇪"],
  ["Géorgie", "🇬🇪"],
  ["Ghana", "🇬🇭"],
  ["Greece", "🇬🇷"],
  ["Grèce", "🇬🇷"],
  ["Guatemala", "🇬🇹"],
  ["Haiti", "🇭🇹"],
  ["Haïti", "🇭🇹"],
  ["Honduras", "🇭🇳"],
  ["Hongrie", "🇭🇺"],
  ["Hungary", "🇭🇺"],
  ["Indonesia", "🇮🇩"],
  ["Indonésie", "🇮🇩"],
  ["Iran", "🇮🇷"],
  ["Irak", "🇮🇶"],
  ["Iraq", "🇮🇶"],
  ["Irlande", "🇮🇪"],
  ["Irlande du Nord", "🇬🇧"],
  ["Italie", "🇮🇹"],
  ["Italy", "🇮🇹"],
  ["Ivory Coast", "🇨🇮"],
  ["Jamaica", "🇯🇲"],
  ["Jamaïque", "🇯🇲"],
  ["Japan", "🇯🇵"],
  ["Japon", "🇯🇵"],
  ["Jordanie", "🇯🇴"],
  ["Jordan", "🇯🇴"],
  ["Korea Republic", "🇰🇷"],
  ["Maroc", "🇲🇦"],
  ["Mexico", "🇲🇽"],
  ["Mexique", "🇲🇽"],
  ["Morocco", "🇲🇦"],
  ["Netherlands", "🇳🇱"],
  ["Nigeria", "🇳🇬"],
  ["Nigéria", "🇳🇬"],
  ["Norvège", "🇳🇴"],
  ["Norway", "🇳🇴"],
  ["Nouvelle-Zélande", "🇳🇿"],
  ["Ouzbékistan", "🇺🇿"],
  ["New Zealand", "🇳🇿"],
  ["Panama", "🇵🇦"],
  ["Paraguay", "🇵🇾"],
  ["Pays-Bas", "🇳🇱"],
  ["Peru", "🇵🇪"],
  ["Pérou", "🇵🇪"],
  ["Pologne", "🇵🇱"],
  ["Poland", "🇵🇱"],
  ["Portugal", "🇵🇹"],
  ["Qatar", "🇶🇦"],
  ["RD Congo", "🇨🇩"],
  ["DR Congo", "🇨🇩"],
  ["Czech Republic", "🇨🇿"],
  ["Czechia", "🇨🇿"],
  ["République dominicaine", "🇩🇴"],
  ["République tchèque", "🇨🇿"],
  ["Roumanie", "🇷🇴"],
  ["Romania", "🇷🇴"],
  ["Saudi Arabia", "🇸🇦"],
  ["Scotland", "🏴"],
  ["Sénégal", "🇸🇳"],
  ["Senegal", "🇸🇳"],
  ["Serbie", "🇷🇸"],
  ["Serbia", "🇷🇸"],
  ["Slovaquie", "🇸🇰"],
  ["Slovénie", "🇸🇮"],
  ["Slovakia", "🇸🇰"],
  ["Slovenia", "🇸🇮"],
  ["South Africa", "🇿🇦"],
  ["South Korea", "🇰🇷"],
  ["Spain", "🇪🇸"],
  ["Suède", "🇸🇪"],
  ["Suisse", "🇨🇭"],
  ["Sweden", "🇸🇪"],
  ["Switzerland", "🇨🇭"],
  ["Tunisie", "🇹🇳"],
  ["Tunisia", "🇹🇳"],
  ["Turquie", "🇹🇷"],
  ["Turkey", "🇹🇷"],
  ["Türkiye", "🇹🇷"],
  ["Ukraine", "🇺🇦"],
  ["United Arab Emirates", "🇦🇪"],
  ["United States", "🇺🇸"],
  ["Uruguay", "🇺🇾"],
  ["USA", "🇺🇸"],
  ["Venezuela", "🇻🇪"],
  ["Wales", "🏴"]
];

const teamFlags = new Map(
  teamFlagEntries.map(([team, flag]) => [normalizeTeamKey(team), flag])
);

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

function matchDayKey(match: Match): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(match.kickoffAt));
}

function stageLabel(match: Match): string {
  if (match.stageKind === "KNOCKOUT") return "Élimination directe";
  return "Groupes";
}

function scoreLabel(match: Match): string {
  if (match.homeScore === null || match.awayScore === null) return "-";
  return `${match.homeScore} - ${match.awayScore}`;
}

function normalizeTeamKey(team: string): string {
  return team
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function teamFlag(team: string): string {
  return teamFlags.get(normalizeTeamKey(team)) ?? "";
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

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored =
    typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem(themeStorageKey)
      : null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choisis un fichier image."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      if (typeof reader.result === "string") {
        resolve(await compressImage(reader.result));
      } else {
        reject(new Error("Impossible de lire cette image."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Impossible de lire cette image.")));
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      resolve(dataUrl);
      return;
    }

    const image = new Image();
    const timeout = window.setTimeout(() => resolve(dataUrl), 1200);
    image.addEventListener("load", () => {
      window.clearTimeout(timeout);
      const scale = Math.min(1, profilePhotoMaxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", profilePhotoQuality));
    });
    image.addEventListener("error", () => {
      window.clearTimeout(timeout);
      resolve(dataUrl);
    });
    image.src = dataUrl;
  });
}

type ProfileStats = {
  submittedPredictions: number;
  totalMatches: number;
  openMissingPredictions: number;
  lockedPredictions: number;
  finishedPredictions: number;
  totalPoints: number;
  exactScores: number;
  correctResultsOnly: number;
  goalDiffBonuses: number;
  averagePoints: number;
  successRate: number;
  groupPoints: number;
  knockoutPoints: number;
  topPredictedScore: string;
  nextMissingMatch: Match | null;
};

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function rankChangeLabel(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return String(value);
  return "stable";
}

function recentFormLabel(value: LeaderboardRow["recentForm"][number]): string {
  if (value === "exact") return "E";
  if (value === "bonus") return "+";
  if (value === "correct") return "R";
  return "0";
}

function activityIcon(type: string) {
  if (type === "new_leader") return <Trophy size={16} />;
  if (type === "correct_streak") return <Sparkles size={16} />;
  return <Check size={16} />;
}

function predictionStateLabel(match: Match): string {
  if (match.locked) return match.prediction ? "Verrouillé" : "Manqué";
  if (match.prediction) return "Enregistré";
  return "À faire";
}

function predictionStateClass(match: Match): string {
  if (match.locked) return "locked";
  if (match.prediction) return "saved";
  return "todo";
}

function buildProfileStats(matches: Match[] = []): ProfileStats {
  const predictedMatches = matches.filter((match) => match.prediction);
  const finishedPredictedMatches = predictedMatches.filter(
    (match) => match.homeScore !== null && match.awayScore !== null
  );
  const scoreCounts = new Map<string, number>();
  let groupPoints = 0;
  let knockoutPoints = 0;

  for (const match of predictedMatches) {
    if (!match.prediction) continue;
    const scoreKey = `${match.prediction.predictedHomeScore}-${match.prediction.predictedAwayScore}`;
    scoreCounts.set(scoreKey, (scoreCounts.get(scoreKey) ?? 0) + 1);
    if (match.stageKind === "KNOCKOUT") {
      knockoutPoints += match.prediction.points;
    } else {
      groupPoints += match.prediction.points;
    }
  }

  const topScore = [...scoreCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const exactScores = finishedPredictedMatches.filter(
    (match) => match.prediction?.exactScore
  ).length;
  const correctResultsOnly = finishedPredictedMatches.filter(
    (match) => match.prediction?.correctResult && !match.prediction.exactScore
  ).length;
  const totalPoints = predictedMatches.reduce(
    (sum, match) => sum + (match.prediction?.points ?? 0),
    0
  );
  const finishedPoints = finishedPredictedMatches.reduce(
    (sum, match) => sum + (match.prediction?.points ?? 0),
    0
  );

  return {
    submittedPredictions: predictedMatches.length,
    totalMatches: matches.length,
    openMissingPredictions: matches.filter((match) => !match.locked && !match.prediction).length,
    lockedPredictions: predictedMatches.filter((match) => match.locked).length,
    finishedPredictions: finishedPredictedMatches.length,
    totalPoints,
    exactScores,
    correctResultsOnly,
    goalDiffBonuses: finishedPredictedMatches.filter(
      (match) => match.prediction?.correctGoalDiff && !match.prediction.exactScore
    ).length,
    averagePoints: finishedPredictedMatches.length ? finishedPoints / finishedPredictedMatches.length : 0,
    successRate: finishedPredictedMatches.length
      ? ((exactScores + correctResultsOnly) / finishedPredictedMatches.length) * 100
      : 0,
    groupPoints,
    knockoutPoints,
    topPredictedScore: topScore ? `${topScore[0]} (${topScore[1]}x)` : "-",
    nextMissingMatch: matches.find((match) => !match.locked && !match.prediction) ?? null
  };
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [publicProfileUserId, setPublicProfileUserId] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(themeStorageKey, theme);
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

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
    return <AuthScreen onAuth={setUser} theme={theme} onToggleTheme={toggleTheme} />;
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
                aria-label={item.label}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
        </div>
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
        {view === "leaderboard" && (
          <Leaderboard
            currentUser={user}
            onOpenProfile={(userId) => {
              setPublicProfileUserId(userId);
              setView("publicProfile");
            }}
          />
        )}
        {view === "results" && <Results />}
        {view === "rules" && <Rules />}
        {view === "profile" && <Profile user={user} />}
        {view === "publicProfile" && publicProfileUserId && (
          <PublicProfile userId={publicProfileUserId} onBack={() => setView("leaderboard")} />
        )}
      </main>
    </div>
  );
}

function AuthScreen({
  onAuth,
  theme,
  onToggleTheme
}: {
  onAuth: (user: User) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
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
        <div className="auth-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
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
                <span className={`activity-icon ${item.type}`}>{activityIcon(item.type)}</span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}

function Predictions() {
  const { data, error, reload, loading } = useResource<{ matches: Match[] }>("/api/matches");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function save(match: Match, homeScore: number, awayScore: number, winnerTeam: string | null) {
    setSavingId(match.id);
    setSavedId(null);
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
      setSavedId(match.id);
      setMessage("Prono enregistré.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Erreur d'enregistrement.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <ShellState label="Chargement des matchs..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const matches = [...(data?.matches ?? [])].sort(
    (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
  );
  const openMatches = matches.filter((match) => !match.locked);
  const savedMatches = matches.filter((match) => match.prediction);
  const missingOpenMatches = openMatches.filter((match) => !match.prediction);
  const groupedMatches = matches.reduce<Array<{ day: string; matches: Match[] }>>(
    (groups, match) => {
      const day = matchDayKey(match);
      const currentGroup = groups.at(-1);
      if (currentGroup?.day === day) {
        currentGroup.matches.push(match);
      } else {
        groups.push({ day, matches: [match] });
      }
      return groups;
    },
    []
  );

  return (
    <section className="content-section predictions-section">
      <SectionTitle title="Mes pronos" action={<RefreshButton onClick={reload} />} />
      <p className="section-subtitle">
        Sauvegarde un score exact, puis modifie-le librement jusqu'au coup d'envoi du match.
      </p>
      <div className="prediction-summary" aria-label="Résumé des pronostics">
        <Metric label="À faire" value={String(missingOpenMatches.length)} />
        <Metric label="Enregistrés" value={`${savedMatches.length}/${matches.length}`} />
        <Metric label="Ouverts" value={String(openMatches.length)} />
      </div>
      {message && <p className="inline-message">{message}</p>}
      {matches.length ? (
        <div className="prediction-day-list">
          {groupedMatches.map((group) => (
            <section className="prediction-day" key={group.day} aria-labelledby={`prediction-day-${group.day}`}>
              <div className="prediction-day-header">
                <div>
                  <span className="eyebrow">{group.matches.length} match{group.matches.length > 1 ? "s" : ""}</span>
                  <h2 id={`prediction-day-${group.day}`}>{formatDay(group.day)}</h2>
                </div>
                <span className="status-chip">
                  {group.matches.filter((match) => !match.locked && !match.prediction).length} à faire
                </span>
              </div>
              <div className="prediction-card-grid">
                {group.matches.map((match) => (
                  <PredictionEditor
                    key={match.id}
                    match={match}
                    saving={savingId === match.id}
                    savedRecently={savedId === match.id}
                    onSave={save}
                  />
                ))}
              </div>
            </section>
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
  savedRecently,
  onSave
}: {
  match: Match;
  saving: boolean;
  savedRecently: boolean;
  onSave: (match: Match, home: number, away: number, winnerTeam: string | null) => Promise<void>;
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

  const originalHome = match.prediction?.predictedHomeScore ?? 0;
  const originalAway = match.prediction?.predictedAwayScore ?? 0;
  const originalWinner = match.prediction?.predictedWinnerTeam ?? null;
  const hasPrediction = Boolean(match.prediction);
  const dirty =
    home !== originalHome ||
    away !== originalAway ||
    (tiedKnockout && winnerTeam !== originalWinner);
  const needsWinner = tiedKnockout && !winnerTeam;
  const canSave = !match.locked && !saving && !needsWinner && (!hasPrediction || dirty);
  const buttonLabel = match.locked
    ? "Verrouillé"
    : saving
      ? "Sauvegarde..."
      : hasPrediction && !dirty
        ? savedRecently
          ? "Enregistré"
          : "Déjà enregistré"
        : hasPrediction
          ? "Mettre à jour"
          : "Enregistrer";
  const helperText = match.locked
    ? "Le coup d'envoi est passé, ce prono n'est plus modifiable."
    : hasPrediction && !dirty
      ? `Modifiable jusqu'au ${formatDate(match.kickoffAt)}.`
      : "Le bouton sauvegarde ce score jusqu'au coup d'envoi.";

  return (
    <article className={`prediction-card ${predictionStateClass(match)}`}>
      <div className="prediction-card-header">
        <div>
          <span className="eyebrow">{stageLabel(match)} · {formatDate(match.kickoffAt)}</span>
          <strong className="match-teams prediction-match-title" aria-hidden="true">
            <span className="match-team">
              {teamFlag(match.homeTeam) && <span className="team-flag">{teamFlag(match.homeTeam)}</span>}
              <span>{match.homeTeam}</span>
            </span>
            <span className="match-separator">-</span>
            <span className="match-team">
              {teamFlag(match.awayTeam) && <span className="team-flag">{teamFlag(match.awayTeam)}</span>}
              <span>{match.awayTeam}</span>
            </span>
          </strong>
          <span className="visually-hidden">{match.homeTeam} - {match.awayTeam}</span>
        </div>
        <span className={`prediction-state ${predictionStateClass(match)}`}>
          {predictionStateLabel(match)}
        </span>
      </div>
      <div className="score-editor">
        <label className="score-control">
          <span>{match.homeTeam}</span>
          <input
            aria-label={`Score ${match.homeTeam}`}
            type="number"
            min={0}
            max={30}
            value={home}
            disabled={match.locked}
            onChange={(event) => setHome(Number(event.target.value))}
          />
        </label>
        <span className="score-divider">-</span>
        <label className="score-control">
          <span>{match.awayTeam}</span>
          <input
            aria-label={`Score ${match.awayTeam}`}
            type="number"
            min={0}
            max={30}
            value={away}
            disabled={match.locked}
            onChange={(event) => setAway(Number(event.target.value))}
          />
        </label>
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
      </div>
      <div className="prediction-card-footer">
        <span>{helperText}</span>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void onSave(match, home, away, tiedKnockout ? winnerTeam : null)}
        >
          {match.locked ? <Lock size={16} /> : hasPrediction && !dirty ? <Check size={16} /> : <Save size={16} />}
          {buttonLabel}
        </button>
      </div>
    </article>
  );
}

function Leaderboard({
  currentUser,
  onOpenProfile
}: {
  currentUser: User;
  onOpenProfile: (userId: string) => void;
}) {
  const { data, error, reload, loading } = useResource<{ leaderboard: LeaderboardRow[] }>(
    "/api/leaderboard"
  );

  if (loading) return <ShellState label="Calcul du classement..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <section className="content-section">
      <SectionTitle title="Classement général" action={<RefreshButton onClick={reload} />} />
      <div className="leaderboard-table">
        {data?.leaderboard.map((row) => (
          <button
            type="button"
            key={row.userId}
            className={row.userId === currentUser.id ? "leaderboard-row me" : "leaderboard-row"}
            onClick={() => onOpenProfile(row.userId)}
          >
            <span className="rank">#{row.rank}</span>
            <span className="leaderboard-avatar">
              {row.photoUrl ? <img src={row.photoUrl} alt="" /> : initials(row.pseudo)}
            </span>
            <span className="leaderboard-player">
              <strong>{row.pseudo}</strong>
              <small>{row.tagline || "Profil à compléter"}</small>
            </span>
            <span>{row.points} pts</span>
            <span>{row.exactScores} exacts</span>
            <span>{row.correctResults} bons résultats</span>
            <span>{row.correctGoalDiffs} écarts</span>
            <span>{row.averagePoints.toFixed(1)} moy.</span>
            <span className={`rank-change ${row.rankChange > 0 ? "up" : row.rankChange < 0 ? "down" : ""}`}>
              {rankChangeLabel(row.rankChange)}
            </span>
            <span className="recent-form" aria-label={`Forme récente ${row.recentForm.join(", ") || "vide"}`}>
              {row.recentForm.length ? (
                row.recentForm.map((item, index) => (
                  <span key={`${item}-${index}`} className={`form-dot ${item}`}>
                    {recentFormLabel(item)}
                  </span>
                ))
              ) : (
                <span className="form-empty">-</span>
              )}
            </span>
            <span className="leaderboard-profile-link">
              <UserRound size={14} />
              Profil
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Results() {
  return (
    <section className="content-section results-empty-section">
      <EmptyState text="Résultats en attente." />
    </section>
  );
}

function Profile({ user }: { user: User }) {
  const matchesResource = useResource<{ matches: Match[] }>("/api/matches");
  const profileResource = useResource<{ profile: UserProfile; badges: ProfileBadge[] }>(
    "/api/profile",
    [user.id]
  );
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const predictionStats = buildProfileStats(matchesResource.data?.matches ?? []);

  useEffect(() => {
    if (profileResource.data?.profile) {
      setProfile({ ...defaultProfile, ...profileResource.data.profile });
    }
    setSaved(false);
    setSaveError("");
    setPhotoError("");
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
      const response = await api<{ profile: UserProfile; badges: ProfileBadge[] }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          photoUrl: profile.photoUrl,
          tagline: profile.tagline,
          favoriteTeam: profile.favoriteTeam
        })
      });
      setProfile({ ...defaultProfile, ...response.profile });
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Impossible d'enregistrer le profil.");
    }
  }

  async function usePhotoFile(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    try {
      updateProfile({ photoUrl: await readImageFile(file) });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Impossible d'utiliser cette photo.");
    }
  }

  function handlePhotoInput(event: ChangeEvent<HTMLInputElement>) {
    void usePhotoFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handlePhotoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingPhoto(false);
    void usePhotoFile(event.dataTransfer.files[0]);
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
              <ClipboardList size={16} />
              {predictionStats.submittedPredictions} pronos posés
            </span>
          </div>
        </div>
      </section>

      <BadgesSection badges={profileResource.data?.badges ?? []} />

      <section className="content-section">
        <SectionTitle title="Préférences" />
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-form-field">
            <span>
              <Camera size={16} />
              Photo de profil
            </span>
            <div
              className={draggingPhoto ? "photo-dropzone dragging" : "photo-dropzone"}
              onDragEnter={(event) => {
                event.preventDefault();
                setDraggingPhoto(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDraggingPhoto(false)}
              onDrop={handlePhotoDrop}
            >
              <Camera size={22} />
              <strong>Dépose une photo ici</strong>
              <p>ou choisis une image depuis l'explorateur</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => photoInputRef.current?.click()}
              >
                Choisir une photo
              </button>
              <input
                ref={photoInputRef}
                className="visually-hidden"
                aria-label="Choisir une photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoInput}
              />
            </div>
            {photoError && <p className="form-error">{photoError}</p>}
            <input
              value={profile.photoUrl}
              onChange={(event) => updateProfile({ photoUrl: event.target.value })}
              placeholder="Ou colle une URL d'image"
            />
            {profile.photoUrl && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => updateProfile({ photoUrl: "" })}
              >
                Supprimer ma photo
              </button>
            )}
          </div>
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
          {saveError && <p className="form-error">{saveError}</p>}
          <button className="primary-button" type="submit">
            <Save size={18} />
            Enregistrer mon profil
          </button>
          {saved && <p className="inline-message">Profil enregistré.</p>}
        </form>
      </section>

      <section className="content-section profile-stats-section">
        <SectionTitle title="Stats pronostics" action={<RefreshButton onClick={matchesResource.reload} />} />
        {matchesResource.loading ? (
          <EmptyState text="Calcul des stats en cours..." />
        ) : matchesResource.error ? (
          <ErrorState error={matchesResource.error} onRetry={matchesResource.reload} />
        ) : (
          <>
            <div className="profile-stat-grid">
              <ProfileStatCard label="Pronos posés" value={`${predictionStats.submittedPredictions}/${predictionStats.totalMatches}`} />
              <ProfileStatCard label="À faire" value={String(predictionStats.openMissingPredictions)} tone="attention" />
              <ProfileStatCard label="Points" value={String(predictionStats.totalPoints)} />
              <ProfileStatCard label="Moyenne" value={predictionStats.averagePoints.toFixed(1)} />
              <ProfileStatCard label="Scores exacts" value={String(predictionStats.exactScores)} tone="success" />
              <ProfileStatCard label="Bons résultats" value={String(predictionStats.correctResultsOnly)} />
              <ProfileStatCard label="Bonus écart" value={String(predictionStats.goalDiffBonuses)} />
              <ProfileStatCard label="Réussite" value={formatPercent(predictionStats.successRate)} />
              <ProfileStatCard label="Pronos verrouillés" value={String(predictionStats.lockedPredictions)} />
              <ProfileStatCard label="Score favori" value={predictionStats.topPredictedScore} />
            </div>
            <div className="profile-split-stats">
              <div>
                <span>Points groupes</span>
                <strong>{predictionStats.groupPoints}</strong>
              </div>
              <div>
                <span>Points élimination</span>
                <strong>{predictionStats.knockoutPoints}</strong>
              </div>
              <div>
                <span>Matchs évalués</span>
                <strong>{predictionStats.finishedPredictions}</strong>
              </div>
            </div>
            {predictionStats.nextMissingMatch ? (
              <div className="profile-next-prediction">
                <span className="eyebrow">Prochain prono à compléter</span>
                <MatchLine match={predictionStats.nextMissingMatch} compact />
              </div>
            ) : (
              <EmptyState text="Aucun prono ouvert en attente." />
            )}
          </>
        )}
      </section>
    </div>
  );
}

type PublicProfileData = {
  user: User;
  profile: UserProfile;
  stats: PublicProfileStats;
  badges: ProfileBadge[];
  rank: number | null;
};

function PublicProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data, error, reload, loading } = useResource<PublicProfileData>(
    `/api/users/${userId}/profile`,
    [userId]
  );

  if (loading) return <ShellState label="Chargement du profil joueur..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="public-profile-layout">
      <section className="content-section profile-hero">
        <div className="profile-photo-frame">
          {data.profile.photoUrl ? (
            <img src={data.profile.photoUrl} alt={`Photo de ${data.user.pseudo}`} />
          ) : (
            <span>{initials(data.user.pseudo)}</span>
          )}
        </div>
        <div className="profile-intro">
          <span className="eyebrow">Profil joueur</span>
          <h2>{data.user.pseudo}</h2>
          <p>{data.profile.tagline || "Profil à compléter."}</p>
          <div className="profile-chips">
            <span>
              <Trophy size={16} />
              Rang : {data.rank ? `#${data.rank}` : "-"}
            </span>
            <span>
              <Star size={16} />
              Favori : {data.profile.favoriteTeam || "Non renseigné"}
            </span>
          </div>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          Retour classement
        </button>
      </section>

      <BadgesSection badges={data.badges} />

      <section className="content-section profile-stats-section">
        <SectionTitle title="Stats publiques" action={<RefreshButton onClick={reload} />} />
        <div className="profile-stat-grid">
          <ProfileStatCard label="Pronos posés" value={`${data.stats.submittedPredictions}/${data.stats.totalMatches}`} />
          <ProfileStatCard label="Points" value={String(data.stats.totalPoints)} />
          <ProfileStatCard label="Moyenne" value={data.stats.averagePoints.toFixed(1)} />
          <ProfileStatCard label="Scores exacts" value={String(data.stats.exactScores)} tone="success" />
          <ProfileStatCard label="Bons résultats" value={String(data.stats.correctResults)} />
          <ProfileStatCard label="Bonus écart" value={String(data.stats.goalDiffBonuses)} />
          <ProfileStatCard label="Réussite" value={formatPercent(data.stats.successRate)} />
        </div>
        <div className="profile-split-stats">
          <div>
            <span>Points groupes</span>
            <strong>{data.stats.groupPoints}</strong>
          </div>
          <div>
            <span>Points élimination</span>
            <strong>{data.stats.knockoutPoints}</strong>
          </div>
          <div>
            <span>Favori compétition</span>
            <strong>{data.profile.favoriteTeam || "-"}</strong>
          </div>
        </div>
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
        La phase finale double le barème : 10 points pour un score exact,
        6 points pour le bon résultat, 8 points si le bon écart est aussi trouvé.
      </p>
      <h2>Verrouillage</h2>
      <p>
        Un prono est modifiable jusqu'à l'heure de coup d'envoi enregistrée en base.
        Après cette heure, il est automatiquement verrouillé.
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
        <strong className="match-teams" aria-hidden="true">
          <span className="match-team">
            {teamFlag(match.homeTeam) && <span className="team-flag">{teamFlag(match.homeTeam)}</span>}
            <span>{match.homeTeam}</span>
          </span>
          <span className="match-separator">-</span>
          <span className="match-team">
            {teamFlag(match.awayTeam) && <span className="team-flag">{teamFlag(match.awayTeam)}</span>}
            <span>{match.awayTeam}</span>
          </span>
        </strong>
        <span className="visually-hidden">{match.homeTeam} - {match.awayTeam}</span>
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

function ProfileStatCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "attention";
}) {
  return (
    <div className={`profile-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BadgesSection({ badges }: { badges: ProfileBadge[] }) {
  return (
    <section className="content-section profile-badges-section">
      <SectionTitle title="Badges" />
      {badges.length ? (
        <div className="badge-grid">
          {badges.map((badge) => (
            <div key={badge.id} className={badge.earned ? "badge-card earned" : "badge-card"}>
              <span className="badge-icon">
                <Medal size={18} />
              </span>
              <div>
                <strong>{badge.label}</strong>
                <p>{badge.description}</p>
              </div>
              <span className="badge-state">{badge.earned ? "Débloqué" : "À débloquer"}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Les badges apparaîtront après les premiers résultats." />
      )}
    </section>
  );
}

function ThemeToggle({
  theme,
  onToggle
}: {
  theme: ThemeMode;
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
      title={dark ? "Mode clair" : "Mode sombre"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? "Clair" : "Sombre"}</span>
    </button>
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
