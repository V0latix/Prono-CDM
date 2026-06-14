import {
  Bell,
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Info,
  Languages,
  LineChart as LineChartIcon,
  Link2,
  Lock,
  LogOut,
  MapPin,
  Medal,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  Scale,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  X,
  UserRound
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  api,
  setApiSessionToken,
  SESSION_EXPIRED_EVENT,
  type ActivityItem,
  type Group,
  type LeaderboardRow,
  type Match,
  type Profile as UserProfile,
  type ProfileBadge,
  type ProfileStats as PublicProfileStats,
  type Progression,
  type SyncStatus,
  type User
} from "./api";
import { currentWeekRange } from "./shared/week";
import {
  computeBestThirds,
  computeGroupStandings,
  isGroupStageComplete,
  type GroupStanding
} from "./shared/standings";
import { buildBracketRounds } from "./shared/bracket";

// Le graphe (recharts, lourd) est chargé à la demande : il ne pèse sur le bundle
// initial que lorsqu'on ouvre le Classement.
const ProgressionChartView = lazy(() => import("./ProgressionChartView"));

type View = "dashboard" | "predictions" | "leaderboard" | "results" | "rules" | "profile" | "publicProfile";
const themeOptions = [
  { id: "classic", label: "Classique" },
  { id: "dark", label: "Dark mode" },
  { id: "minuit", label: "Minuit" },
  { id: "ardoise", label: "Ardoise" },
  { id: "grass", label: "Mode gazon" },
  { id: "neon", label: "Néon stade" },
  { id: "france", label: "Bleu blanc rouge" }
] as const;
type ThemeMode = (typeof themeOptions)[number]["id"];

const languageOptions = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" }
] as const;
type Language = (typeof languageOptions)[number]["id"];
const languageStorageKey = "prono-cdm-language";

// football-data renvoie les noms d'équipes en anglais. On les traduit en
// français pour l'affichage selon la langue choisie. Les variantes d'orthographe
// anglaises pointent vers le même nom français.
const teamTranslationEntries: Array<[string, string]> = [
  ["Argentina", "Argentine"],
  ["Australia", "Australie"],
  ["Austria", "Autriche"],
  ["Belgium", "Belgique"],
  ["Bolivia", "Bolivie"],
  ["Brazil", "Brésil"],
  ["Cameroon", "Cameroun"],
  ["Canada", "Canada"],
  ["Cape Verde", "Cap-Vert"],
  ["Chile", "Chili"],
  ["China", "Chine"],
  ["China PR", "Chine"],
  ["Colombia", "Colombie"],
  ["Costa Rica", "Costa Rica"],
  ["Croatia", "Croatie"],
  ["Czech Republic", "République tchèque"],
  ["Czechia", "République tchèque"],
  ["Denmark", "Danemark"],
  ["DR Congo", "RD Congo"],
  ["Ecuador", "Équateur"],
  ["Egypt", "Égypte"],
  ["England", "Angleterre"],
  ["France", "France"],
  ["Georgia", "Géorgie"],
  ["Germany", "Allemagne"],
  ["Ghana", "Ghana"],
  ["Greece", "Grèce"],
  ["Guatemala", "Guatemala"],
  ["Haiti", "Haïti"],
  ["Honduras", "Honduras"],
  ["Hungary", "Hongrie"],
  ["Indonesia", "Indonésie"],
  ["Iran", "Iran"],
  ["Iraq", "Irak"],
  ["Ireland", "Irlande"],
  ["Republic of Ireland", "Irlande"],
  ["Italy", "Italie"],
  ["Ivory Coast", "Côte d'Ivoire"],
  ["Côte d'Ivoire", "Côte d'Ivoire"],
  ["Jamaica", "Jamaïque"],
  ["Japan", "Japon"],
  ["Jordan", "Jordanie"],
  ["Korea Republic", "Corée du Sud"],
  ["South Korea", "Corée du Sud"],
  ["North Korea", "Corée du Nord"],
  ["Korea DPR", "Corée du Nord"],
  ["Mexico", "Mexique"],
  ["Morocco", "Maroc"],
  ["Netherlands", "Pays-Bas"],
  ["New Zealand", "Nouvelle-Zélande"],
  ["Nigeria", "Nigéria"],
  ["Norway", "Norvège"],
  ["Panama", "Panama"],
  ["Paraguay", "Paraguay"],
  ["Peru", "Pérou"],
  ["Poland", "Pologne"],
  ["Portugal", "Portugal"],
  ["Qatar", "Qatar"],
  ["Romania", "Roumanie"],
  ["Saudi Arabia", "Arabie saoudite"],
  ["Scotland", "Écosse"],
  ["Senegal", "Sénégal"],
  ["Serbia", "Serbie"],
  ["Slovakia", "Slovaquie"],
  ["Slovenia", "Slovénie"],
  ["South Africa", "Afrique du Sud"],
  ["Spain", "Espagne"],
  ["Sweden", "Suède"],
  ["Switzerland", "Suisse"],
  ["Tunisia", "Tunisie"],
  ["Turkey", "Turquie"],
  ["Türkiye", "Turquie"],
  ["Ukraine", "Ukraine"],
  ["United States", "États-Unis"],
  ["USA", "États-Unis"],
  ["Uruguay", "Uruguay"],
  ["Uzbekistan", "Ouzbékistan"],
  ["Wales", "Pays de Galles"]
];

type DashboardData = {
  nextMatches: Match[];
  predictionDay: string | null;
  predictionDayMatches: Match[];
  lastResult?: Match | null;
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

export const releaseNotes = [
  {
    title: "Les matchs du jour direct en haut",
    description: "Mes pronos ouvre désormais sur les matchs à venir : les jours déjà passés sont repliés derrière un bouton « Afficher les jours passés ». Dans Résultats, les derniers matchs joués s'affichent en premier. Et enregistrer un prono ne te renvoie plus tout en haut de la page.",
    date: "2026-06-14"
  },
  {
    title: "Stade et chaîne TV sur chaque match",
    description: "Chaque match affiche désormais le stade où il se joue et la chaîne qui le diffuse : beIN SPORTS pour tous, et le badge M6 sur les matchs de poule diffusés en clair.",
    date: "2026-06-11"
  },
  {
    title: "La phase finale tour par tour",
    description: "Nouvel onglet « Tableau final » dans Résultats : retrouve tous les matchs à élimination directe, des 16es à la finale, tour par tour, avec les scores et l'équipe qualifiée mise en avant.",
    date: "2026-06-11"
  },
  {
    title: "Les meilleurs 3es mis en avant",
    description: "Dans le classement des poules (onglet Résultats), les 8 meilleurs 3es qui filent en 16es de finale sont surlignés en ambre, en plus des deux premiers de chaque groupe en vert.",
    date: "2026-06-11"
  },
  {
    title: "Une pluie de nouveaux badges",
    description: "Décroche le Centenaire (100 points), les paliers de 10, 20 et 30 scores exacts, le Prophète de la finale, le Roi des poules, le sans-faute sur deux jours d'affilée… et même la Lanterne rouge si tu fermes le classement.",
    date: "2026-06-11"
  },
  {
    title: "Saisie des scores plus simple sur mobile",
    description: "Quand tu touches une case de score, le chiffre se sélectionne tout seul : tu tapes ton score directement, sans avoir à effacer le 0 qui restait coincé. Tu peux aussi vider la case pour repartir de zéro.",
    date: "2026-06-11"
  },
  {
    title: "Le classement des poules dans Résultats",
    description: "Dans l'onglet Résultats, bascule sur « Poules » pour voir le classement de chaque groupe (Groupe A, B…) avec points, victoires et différence de buts. Les deux premiers de chaque poule sont mis en avant.",
    date: "2026-06-10"
  },
  {
    title: "Change ton code PIN quand tu veux",
    description: "Depuis ton profil, section « Sécurité », tu peux maintenant définir un nouveau code PIN de connexion. Pratique si tu veux le renouveler ou après avoir reçu un code provisoire.",
    date: "2026-06-10"
  },
  {
    title: "Les matchs de la nuit aussi à pronostiquer",
    description: "La carte « Prédictions à faire maintenant » regroupe désormais toute la soirée de matchs, y compris ceux qui se jouent après minuit. Plus aucun match de nuit oublié.",
    date: "2026-06-10"
  },
  {
    title: "Ton dernier résultat sur le dashboard",
    description: "Une nouvelle carte affiche le dernier match terminé avec ton prono et les points que tu viens de gagner, dès l'ouverture de l'app.",
    date: "2026-06-10"
  },
  {
    title: "Classement de la semaine",
    description: "Sur la page Classement, bascule entre le général et « Cette semaine » pour voir qui marque le plus de points sur les matchs de la semaine en cours.",
    date: "2026-06-10"
  },
  {
    title: "Résultats mis à jour plus souvent",
    description: "Les scores et les points se rafraîchissent plus rapidement après les matchs, pour suivre le classement quasiment en direct.",
    date: "2026-06-10"
  },
  {
    title: "Interface plus lisible et confortable",
    description: "Police plus nette, libellés agrandis, matchs « bientôt verrouillés » mis en avant et angles adoucis sur mobile. Le choix du thème est désormais dans ton profil.",
    date: "2026-06-10"
  },
  {
    title: "Trois nouveaux thèmes",
    description: "Habille l'app à ton goût depuis ton profil : Minuit (bleu nuit chic), Ardoise (clair et net) et Néon stade (vert fluo qui claque).",
    date: "2026-06-10"
  },
  {
    title: "Chaque match affiche sa poule et son tour",
    description: "Tu vois d'un coup d'œil le groupe (Groupe A, B…) en phase de poules, puis le tour en phase finale : 8e de finale, quart, demie, finale.",
    date: "2026-06-10"
  },
  {
    title: "Rappels par email",
    description: "Active les rappels dans ton profil pour recevoir un email avant chaque match que tu n'as pas encore pronostiqué, avec le lien direct vers l'app.",
    date: "2026-06-10"
  },
  {
    title: "Les nouveautés à l'ouverture",
    description: "À chaque nouvelle version, un récap des nouveautés s'affiche au lancement. Tu le fermes en un clic et il ne revient qu'à la prochaine mise à jour.",
    date: "2026-06-10"
  },
  {
    title: "Choisis la langue des équipes",
    description: "Affiche les noms d'équipes en français ou en anglais. Le réglage est dans ton profil et s'applique partout dans l'app.",
    date: "2026-06-06"
  },
  {
    title: "Invite tes potes en un lien",
    description: "Chaque groupe a maintenant un code d'invitation à partager. Tes amis le saisissent ou cliquent sur ton lien pour te rejoindre direct.",
    date: "2026-06-06"
  },
  {
    title: "Page Résultats enfin là",
    description: "Retrouve tous les matchs terminés avec ton prono, le vrai score et les points gagnés, match par match.",
    date: "2026-06-06"
  },
  {
    title: "Compte à rebours du prochain match",
    description: "Quand il te reste un prono à poser, un bandeau t'affiche le temps restant avant le coup d'envoi pour ne plus rien oublier.",
    date: "2026-06-06"
  },
  {
    title: "Saisie des scores plus rapide",
    description: "Des boutons + et - permettent d'ajuster les scores d'un pouce, parfait sur mobile.",
    date: "2026-06-06"
  },
  {
    title: "Nouveaux badges fun",
    description: "Bon élève, Madame Irma, le chat noir et d'autres badges viennent pimenter les profils.",
    date: "2026-06-05"
  },
  {
    title: "Thèmes plus lisibles",
    description: "Les thèmes Gazon et Bleu blanc rouge passent sur une police sans-serif plus nette, avec un meilleur confort de lecture.",
    date: "2026-06-05"
  },
  {
    title: "Groupes entre amis",
    description: "Crée des groupes, rejoins ceux de tes potes et compare les classements par groupe.",
    date: "2026-06-05"
  }
];

// Clé de version des nouveautés : change dès qu'on ajoute une release note en
// tête de liste, ce qui ré-affiche automatiquement le pop-up à la réouverture.
export const NEWS_STORAGE_KEY = "prono-cdm-news-seen";
export const NEWS_VERSION = `${releaseNotes[0]?.date ?? ""}:${releaseNotes[0]?.title ?? ""}`;

// État partagé "dernières nouveautés vues" : pilote à la fois la pastille du
// bouton et l'ouverture du pop-up, pour qu'ils restent synchronisés.
function useNewsSeen() {
  const [seenVersion, setSeenVersion] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(NEWS_STORAGE_KEY);
    } catch {
      return NEWS_VERSION;
    }
  });

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(NEWS_STORAGE_KEY, NEWS_VERSION);
    } catch {
      // localStorage indisponible : on garde l'état en mémoire pour la session.
    }
    setSeenVersion(NEWS_VERSION);
  }, []);

  return { unseen: seenVersion !== NEWS_VERSION, markSeen };
}

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

// Clé du jour courant au même format que matchDayKey (YYYY-MM-DD), pour comparer
// des jours par simple comparaison de chaînes.
function todayKey(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

// Libellé court du tour à élimination directe à partir du code football-data.
function knockoutRoundLabel(stage: string): string {
  const normalized = stage.toUpperCase();
  if (normalized.includes("LAST_32") || normalized.includes("ROUND_OF_32")) return "16e de finale";
  if (normalized.includes("LAST_16") || normalized.includes("ROUND_OF_16")) return "8e de finale";
  if (normalized.includes("QUARTER")) return "1/4 de finale";
  if (normalized.includes("SEMI")) return "1/2 finale";
  if (normalized.includes("THIRD_PLACE")) return "Petite finale";
  if (normalized.includes("FINAL")) return "Finale";
  return "Élimination directe";
}

// Extrait la lettre de poule d'un code football-data ("GROUP_A" -> "A").
function groupLetter(group: string | null): string {
  if (!group) return "";
  const match = group.toUpperCase().match(/([A-Z0-9]+)$/);
  return match ? match[1] : "";
}

function stageLabel(match: Match): string {
  if (match.stageKind === "KNOCKOUT") return knockoutRoundLabel(match.stage);
  const letter = groupLetter(match.group);
  return letter ? `Groupe ${letter}` : "Groupes";
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

const englishToFrenchTeam = new Map(
  teamTranslationEntries.map(([english, french]) => [normalizeTeamKey(english), french])
);
const frenchToEnglishTeam = new Map(
  teamTranslationEntries.map(([english, french]) => [normalizeTeamKey(french), english])
);

function translateTeam(team: string, language: Language): string {
  if (!team) return team;
  const key = normalizeTeamKey(team);
  if (language === "fr") return englishToFrenchTeam.get(key) ?? team;
  return frenchToEnglishTeam.get(key) ?? team;
}

const LanguageContext = createContext<Language>("fr");

function useLanguage(): Language {
  return useContext(LanguageContext);
}

// Hook pratique : renvoie une fonction de traduction d'équipe liée à la langue active.
function useTeamLabel(): (team: string) => string {
  const language = useLanguage();
  return (team: string) => translateTeam(team, language);
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
  if (typeof window === "undefined") return "classic";
  const stored =
    typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem(themeStorageKey)
      : null;
  if (isThemeMode(stored)) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "classic";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return themeOptions.some((option) => option.id === value);
}

function isLanguage(value: string | null): value is Language {
  return languageOptions.some((option) => option.id === value);
}

function initialLanguage(): Language {
  if (typeof window === "undefined") return "fr";
  const stored =
    typeof window.localStorage?.getItem === "function"
      ? window.localStorage.getItem(languageStorageKey)
      : null;
  return isLanguage(stored) ? stored : "fr";
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

// Un match est "bientôt verrouillé" s'il n'est pas encore verrouillé et débute
// dans moins de 3h. Sert à mettre en avant les pronos urgents.
function isMatchSoon(match: Match): boolean {
  if (match.locked) return false;
  const diff = Date.parse(match.kickoffAt) - Date.now();
  return diff > 0 && diff < 3 * 60 * 60 * 1000;
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
  const [profileSetupPending, setProfileSetupPending] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [publicProfileUserId, setPublicProfileUserId] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [sessionExpired, setSessionExpired] = useState(false);
  const news = useNewsSeen();

  // Une requete authentifiee a recu un 401 : on revient proprement a l'ecran de
  // connexion (au lieu d'un "Reessayer" qui rejoue la meme requete en echec).
  useEffect(() => {
    function onSessionExpired() {
      setApiSessionToken(null);
      setUser((current) => {
        if (current) setSessionExpired(true);
        return null;
      });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(themeStorageKey, theme);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    if (typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(languageStorageKey, language);
    }
  }, [language]);

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
  }

  function changeTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
  }

  useEffect(() => {
    api<{ user: User | null }>("/api/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  // Deep-link d'invitation : ?join=CODE rejoint automatiquement le groupe une
  // fois l'utilisateur connecté, puis nettoie l'URL.
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (!code) return;
    let cancelled = false;
    api<{ joinedGroupName: string }>("/api/groups/join-by-code", {
      method: "POST",
      body: JSON.stringify({ code })
    })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        params.delete("join");
        const query = params.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`
        );
        setView("profile");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (checkingSession) {
    return <ShellState label="Chargement de la session..." />;
  }

  if (!user) {
    return (
      <AuthScreen
        onAuth={(authUser, needsProfileSetup) => {
          setSessionExpired(false);
          setUser(authUser);
          setProfileSetupPending(needsProfileSetup);
        }}
        theme={theme}
        onThemeChange={changeTheme}
        sessionExpired={sessionExpired}
      />
    );
  }

  if (profileSetupPending) {
    return (
      <ProfileSetup
        user={user}
        theme={theme}
        onThemeChange={changeTheme}
        onComplete={() => setProfileSetupPending(false)}
      />
    );
  }

  return (
    <LanguageContext.Provider value={language}>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">26</div>
          <div>
            <strong>Prono CDM</strong>
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
          <button
            className="logout-button"
            type="button"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setApiSessionToken(null);
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
            <p className="eyebrow">Coupe du monde 2026</p>
            <h1>{viewTitles[view]}</h1>
          </div>
          <div className="topbar-actions">
            <WhatsNewBubble unseen={news.unseen} onSeen={news.markSeen} />
            <button className="user-pill" type="button" onClick={() => setView("profile")}>
              <UserRound size={18} />
              {user.pseudo}
            </button>
          </div>
        </header>
        <WhatsNewModal unseen={news.unseen} onDismiss={news.markSeen} />
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
        {view === "profile" && (
          <Profile
            user={user}
            language={language}
            onLanguageChange={changeLanguage}
            theme={theme}
            onThemeChange={changeTheme}
          />
        )}
        {view === "publicProfile" && publicProfileUserId && (
          <PublicProfile userId={publicProfileUserId} onBack={() => setView("leaderboard")} />
        )}
      </main>
    </div>
    </LanguageContext.Provider>
  );
}

function WhatsNewBubble({ unseen, onSeen }: { unseen: boolean; onSeen: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  function toggle() {
    setIsOpen((open) => {
      const next = !open;
      if (next && unseen) onSeen();
      return next;
    });
  }

  return (
    <div className="whats-new">
      <button
        className="news-button"
        type="button"
        aria-expanded={isOpen}
        aria-controls="whats-new-panel"
        aria-label={unseen ? "Nouveautés (non lues)" : "Nouveautés"}
        onClick={toggle}
      >
        <Info size={18} />
        <span>Nouveautés</span>
        {unseen ? <span className="news-dot" aria-hidden="true" /> : null}
      </button>
      {isOpen ? (
        <section className="news-panel" id="whats-new-panel" aria-label="Nouveautés de l'application">
          <div className="news-panel-header">
            <div>
              <span>Quoi de neuf</span>
              <strong>Dernières nouveautés</strong>
            </div>
            <button type="button" aria-label="Fermer les nouveautés" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <ul>
            {releaseNotes.map((note) => (
              <li key={note.title}>
                <div className="news-item-head">
                  <strong>{note.title}</strong>
                  {note.date ? <span className="news-date">{formatDay(note.date)}</span> : null}
                </div>
                <p>{note.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// Pop-up affiché à la réouverture de l'app tant que les dernières nouveautés
// n'ont pas été vues. On retient la version vue dans le localStorage.
function WhatsNewModal({ unseen, onDismiss }: { unseen: boolean; onDismiss: () => void }) {
  const [isOpen, setIsOpen] = useState(unseen);

  function dismiss() {
    onDismiss();
    setIsOpen(false);
  }

  if (!isOpen) return null;

  const highlights = releaseNotes.slice(0, 4);

  return (
    <div className="news-modal-overlay" role="presentation" onClick={dismiss}>
      <div
        className="news-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="news-modal-header">
          <div>
            <span className="news-modal-eyebrow">Quoi de neuf</span>
            <strong id="news-modal-title">Les dernières nouveautés</strong>
          </div>
          <button type="button" aria-label="Fermer les nouveautés" onClick={dismiss}>
            <X size={18} />
          </button>
        </div>
        <ul className="news-modal-list">
          {highlights.map((note) => (
            <li key={note.title}>
              <div className="news-modal-item-head">
                <strong>{note.title}</strong>
                {note.date ? <span className="news-date">{formatDay(note.date)}</span> : null}
              </div>
              <p>{note.description}</p>
            </li>
          ))}
        </ul>
        <button className="primary-button" type="button" onClick={dismiss}>
          C'est noté !
        </button>
      </div>
    </div>
  );
}

function AuthScreen({
  onAuth,
  theme,
  onThemeChange,
  sessionExpired = false
}: {
  onAuth: (user: User, needsProfileSetup: boolean) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  sessionExpired?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">(sessionExpired ? "login" : "register");
  const [pseudo, setPseudo] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user: User; sessionToken?: string }>(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ pseudo, pin })
        }
      );
      setApiSessionToken(data.sessionToken ?? null);
      onAuth(data.user, mode === "register");
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
          <ThemeSelector theme={theme} onChange={onThemeChange} />
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
          {sessionExpired && !error ? (
            <p className="form-notice">Ta session a expiré, reconnecte-toi.</p>
          ) : null}
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
            <span className="field-label-row">
              Code PIN
              <small>4 à 8 chiffres</small>
            </span>
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

function ProfileSetup({
  user,
  theme,
  onThemeChange,
  onComplete
}: {
  user: User;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onComplete: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifEmail, setNotifEmail] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  function updateProfile(update: Partial<UserProfile>) {
    setProfile((current) => ({ ...current, ...update }));
    setError("");
  }

  async function usePhotoFile(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    try {
      updateProfile({ photoUrl: await readImageFile(file) });
    } catch (uploadError) {
      setPhotoError(uploadError instanceof Error ? uploadError.message : "Impossible d'utiliser cette photo.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api<{ profile: UserProfile; badges: ProfileBadge[] }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          photoUrl: profile.photoUrl,
          tagline: profile.tagline,
          favoriteTeam: profile.favoriteTeam
        })
      });
      // Activation best-effort des notifications : un échec ici ne doit pas
      // bloquer la création du profil (réglable ensuite depuis le profil).
      if (notifEnabled && notifEmail.trim()) {
        await api("/api/notifications", {
          method: "PUT",
          body: JSON.stringify({ email: notifEmail.trim(), enabled: true })
        }).catch(() => undefined);
      }
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-layout profile-setup-layout">
      <section className="auth-panel profile-setup-panel">
        <div className="brand compact">
          <div className="brand-mark">26</div>
          <div>
            <strong>Prono CDM</strong>
            <span>Création du profil</span>
          </div>
        </div>
        <div className="profile-setup-preview">
          <div className="profile-photo-frame compact">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={`Photo de ${user.pseudo}`} />
            ) : (
              <span>{initials(user.pseudo)}</span>
            )}
          </div>
          <div>
            <span className="eyebrow">Bienvenue</span>
            <h1>{user.pseudo}</h1>
            <p>{profile.tagline || defaultProfile.tagline}</p>
          </div>
        </div>
        <form className="profile-form" onSubmit={submit}>
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
              onDrop={(event) => {
                event.preventDefault();
                setDraggingPhoto(false);
                void usePhotoFile(event.dataTransfer.files[0]);
              }}
            >
              <Camera size={22} />
              <strong>Dépose une photo ici</strong>
              <p>ou choisis une image depuis ton appareil</p>
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
                aria-label="Choisir une photo de profil"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void usePhotoFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
            {photoError && <p className="form-error">{photoError}</p>}
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
              placeholder="Ex: personne ne bat mon 2-1"
            />
          </label>
          <label>
            <span>
              <Star size={16} />
              Équipe favorite
            </span>
            <input
              value={profile.favoriteTeam}
              onChange={(event) => updateProfile({ favoriteTeam: event.target.value })}
              maxLength={40}
              placeholder="France, Brésil, Argentine..."
            />
          </label>
          <fieldset className="theme-choice-grid">
            <legend>Thème de l'app</legend>
            {themeOptions.map((option) => (
              <label key={option.id} className={`theme-choice-card ${theme === option.id ? "active" : ""}`}>
                <input
                  type="radio"
                  name="profile-theme"
                  value={option.id}
                  checked={theme === option.id}
                  onChange={() => onThemeChange(option.id)}
                />
                <span className={`theme-swatch ${option.id}`} aria-hidden="true" />
                <strong>{option.label}</strong>
              </label>
            ))}
          </fieldset>
          <div className="profile-form-field">
            <label className="preference-row">
              <span>
                <Bell size={16} />
                Rappels par email
              </span>
              <input
                type="checkbox"
                checked={notifEnabled}
                onChange={(event) => setNotifEnabled(event.target.checked)}
              />
            </label>
            {notifEnabled && (
              <input
                type="email"
                value={notifEmail}
                onChange={(event) => setNotifEmail(event.target.value)}
                maxLength={254}
                placeholder="ton.email@exemple.com"
                aria-label="Adresse email pour les rappels"
              />
            )}
            <p className="section-subtitle">
              Reçois un email avant chaque match dont le prono n'est pas encore posé. Tu confirmeras ton adresse via un lien, et tu pourras tout régler plus tard dans ton profil.
            </p>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={18} />
            {saving ? "Enregistrement..." : "Créer mon profil"}
          </button>
        </form>
      </section>
    </div>
  );
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}j ${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function NextMatchCountdown({
  match,
  onOpenPredictions
}: {
  match: Match;
  onOpenPredictions: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const teamLabel = useTeamLabel();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Date.parse(match.kickoffAt) - now;
  if (remaining <= 0) return null;

  return (
    <section className="next-match-banner" aria-live="polite">
      <div className="next-match-banner-info">
        <span className="eyebrow">
          <CalendarClock size={16} /> Prono à poser avant le coup d'envoi
        </span>
        <strong>
          {teamLabel(match.homeTeam)} - {teamLabel(match.awayTeam)}
        </strong>
        <span className="next-match-countdown">
          Il te reste <strong>{formatCountdown(remaining)}</strong> · {formatDate(match.kickoffAt)}
        </span>
        <MatchBroadcast match={match} />
      </div>
      <button className="primary-button" type="button" onClick={onOpenPredictions}>
        <ClipboardList size={16} />
        Poser mon prono
      </button>
    </section>
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
      const result = await api<{ synced: number; error?: string; throttled?: boolean }>("/api/admin/sync", {
        method: "POST"
      });
      setSyncMessage(
        result.throttled
          ? "Synchro déjà à jour, réessaie dans un instant."
          : result.error
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
  // Bandeau compte à rebours : uniquement si un prono reste à poser.
  const nextPendingMatch = data.nextMatches.find(
    (match) => !match.locked && !match.prediction
  );

  return (
    <div className="view-grid">
      {nextPendingMatch ? (
        <NextMatchCountdown match={nextPendingMatch} onOpenPredictions={onOpenPredictions} />
      ) : null}
      <section className="summary-strip">
        <Metric label="Rang" value={data.rank ? `#${data.rank.rank}` : "-"} />
        <Metric label="Points" value={String(data.rank?.points ?? 0)} />
        <Metric label="Scores exacts" value={String(data.rank?.exactScores ?? 0)} />
      </section>
      {data.lastResult ? (
        <section className="content-section">
          <SectionTitle title="Dernier résultat" />
          <div className="last-result">
            <MatchLine match={data.lastResult} showResult />
            <span
              className={`points-badge ${
                (data.lastResult.prediction?.points ?? 0) > 0 ? "win" : "zero"
              }`}
            >
              +{data.lastResult.prediction?.points ?? 0} pts
            </span>
          </div>
        </section>
      ) : null}
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
  const [showPast, setShowPast] = useState(false);

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

  if (loading && !data) return <ShellState label="Chargement des matchs..." />;
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

  // On met en avant les jours à venir / du jour : les jours passés (verrouillés,
  // en lecture seule) sont repliés derrière un bouton. Si aucun jour actif
  // (tournoi terminé), on déplie tout pour ne rien masquer.
  const today = todayKey();
  const pastGroups = groupedMatches.filter((group) => group.day < today);
  const activeGroups = groupedMatches.filter((group) => group.day >= today);
  const hasActiveGroups = activeGroups.length > 0;
  const visibleGroups = !hasActiveGroups
    ? groupedMatches
    : showPast
      ? groupedMatches
      : activeGroups;
  const canTogglePast = hasActiveGroups && pastGroups.length > 0;

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
          {canTogglePast && (
            <button
              type="button"
              className="past-days-toggle"
              aria-expanded={showPast}
              onClick={() => setShowPast((value) => !value)}
            >
              {showPast
                ? "Masquer les jours passés"
                : `Afficher les jours passés (${pastGroups.length})`}
            </button>
          )}
          {visibleGroups.map((group) => (
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

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(30, Math.round(value)));
}

function ScoreInput({
  team,
  value,
  disabled,
  onChange
}: {
  team: string;
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <div className="score-control">
      <span>{team}</span>
      <div className="score-stepper">
        <button
          type="button"
          className="score-step"
          aria-label={`Diminuer le score ${team}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(clampScore(value - 1))}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label={`Score ${team}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={text}
          disabled={disabled}
          onFocus={() => {
            // On vide le champ au focus plutot que de selectionner le contenu :
            // iOS Safari/WebKit n'honore pas `select()` au focus (le 0 restait
            // colle, ex. saisir 3 donnait "30"). Champ vide => la saisie repart
            // de zero sur tous les navigateurs. onBlur restaure si on n'a rien tape.
            setText("");
          }}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^0-9]/g, "").slice(0, 2);
            setText(raw);
            if (raw !== "") onChange(clampScore(Number(raw)));
          }}
          onBlur={() => {
            if (text === "") {
              setText(String(value));
            } else {
              const next = clampScore(Number(text));
              setText(String(next));
              onChange(next);
            }
          }}
        />
        <button
          type="button"
          className="score-step"
          aria-label={`Augmenter le score ${team}`}
          disabled={disabled || value >= 30}
          onClick={() => onChange(clampScore(value + 1))}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
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
  const teamLabel = useTeamLabel();
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
              <span>{teamLabel(match.homeTeam)}</span>
            </span>
            <span className="match-separator">-</span>
            <span className="match-team">
              {teamFlag(match.awayTeam) && <span className="team-flag">{teamFlag(match.awayTeam)}</span>}
              <span>{teamLabel(match.awayTeam)}</span>
            </span>
          </strong>
          <span className="visually-hidden">{teamLabel(match.homeTeam)} - {teamLabel(match.awayTeam)}</span>
          <MatchBroadcast match={match} />
        </div>
        <span className={`prediction-state ${predictionStateClass(match)}`}>
          {predictionStateLabel(match)}
        </span>
      </div>
      <div className="score-editor">
        <ScoreInput
          team={teamLabel(match.homeTeam)}
          value={home}
          disabled={match.locked}
          onChange={setHome}
        />
        <span className="score-divider">-</span>
        <ScoreInput
          team={teamLabel(match.awayTeam)}
          value={away}
          disabled={match.locked}
          onChange={setAway}
        />
        {tiedKnockout && (
          <select
            aria-label="Équipe qualifiée"
            value={winnerTeam ?? ""}
            disabled={match.locked}
            onChange={(event) => setWinnerTeam(event.target.value || null)}
          >
            <option value="">Qualifié</option>
            <option value={match.homeTeam}>{teamLabel(match.homeTeam)}</option>
            <option value={match.awayTeam}>{teamLabel(match.awayTeam)}</option>
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
  const [selectedGroupId, setSelectedGroupId] = useState("global");
  const [period, setPeriod] = useState<"all" | "week">("all");
  // Courbe de progression masquée par défaut ; affichée via le bouton dédié (et
  // recharts n'est chargé que lorsqu'on l'affiche).
  const [showProgression, setShowProgression] = useState(false);
  const groupsResource = useResource<{ groups: Group[] }>("/api/groups");
  const leaderboardPath = (() => {
    const params = new URLSearchParams();
    if (selectedGroupId !== "global") params.set("groupId", selectedGroupId);
    if (period === "week") {
      const { from, to } = currentWeekRange();
      params.set("from", from);
      params.set("to", to);
    }
    const query = params.toString();
    return query ? `/api/leaderboard?${query}` : "/api/leaderboard";
  })();
  const { data, error, reload, loading } = useResource<{ leaderboard: LeaderboardRow[] }>(
    leaderboardPath,
    [leaderboardPath]
  );

  if (loading || groupsResource.loading) return <ShellState label="Calcul du classement..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (groupsResource.error) {
    return <ErrorState error={groupsResource.error} onRetry={groupsResource.reload} />;
  }

  const groups = groupsResource.data?.groups ?? [];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  return (
    <section className="content-section">
      <SectionTitle
        title={
          period === "week"
            ? selectedGroup
              ? `Semaine · ${selectedGroup.name}`
              : "Classement de la semaine"
            : selectedGroup
              ? `Classement · ${selectedGroup.name}`
              : "Classement général"
        }
        action={<RefreshButton onClick={reload} />}
      />
      <div className="leaderboard-filter">
        <label>
          <span>Vue</span>
          <select
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
          >
            <option value="global">Général</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.memberCount})
              </option>
            ))}
          </select>
        </label>
        <div className="period-toggle" role="group" aria-label="Période du classement">
          <button
            type="button"
            className={period === "all" ? "active" : ""}
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            Général
          </button>
          <button
            type="button"
            className={period === "week" ? "active" : ""}
            aria-pressed={period === "week"}
            onClick={() => setPeriod("week")}
          >
            Cette semaine
          </button>
        </div>
      </div>
      {period === "all" && (
        <div className="progression-toggle-row">
          <button
            type="button"
            className="progression-toggle"
            aria-pressed={showProgression}
            onClick={() => setShowProgression((value) => !value)}
          >
            <LineChartIcon size={16} />
            {showProgression ? "Masquer la courbe" : "Afficher la courbe de progression"}
          </button>
        </div>
      )}
      {period === "all" && showProgression && (
        <ProgressionChart
          groupId={selectedGroupId === "global" ? undefined : selectedGroupId}
          currentUserId={currentUser.id}
        />
      )}
      {data?.leaderboard.length ? (
        <div className="leaderboard-table">
          {data.leaderboard.map((row) => (
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
      ) : (
        <EmptyState
          text={
            period === "week"
              ? "Aucun point marqué cette semaine pour le moment."
              : "Aucun membre dans ce groupe pour le moment."
          }
        />
      )}
    </section>
  );
}

function ProgressionChart({
  groupId,
  currentUserId
}: {
  groupId?: string;
  currentUserId: string;
}) {
  const path = groupId
    ? `/api/stats/progression?groupId=${encodeURIComponent(groupId)}`
    : "/api/stats/progression";
  const { data, error, loading } = useResource<{ progression: Progression }>(path, [path]);

  if (loading) {
    return <div className="progression-card progression-card--state">Calcul de la courbe...</div>;
  }
  // En cas d'erreur, on masque la courbe : le tableau de classement reste l'essentiel.
  if (error) return null;

  const progression = data?.progression;
  if (!progression || progression.points.length === 0) {
    return (
      <div className="progression-card progression-card--state">
        La courbe des points cumulés apparaîtra après les premiers matchs terminés.
      </div>
    );
  }

  // On masque la ligne « leader » quand le leader, c'est moi (lignes superposées).
  const showLeader =
    progression.leaderUserId !== null && progression.leaderUserId !== currentUserId;
  const chartData = progression.points.map((point, index) => ({
    index: index + 1,
    label: `${point.homeTeam} - ${point.awayTeam}`,
    me: point.me,
    leader: point.leader,
    average: Number(point.average.toFixed(2))
  }));

  return (
    <div className="progression-card">
      <div className="progression-card-header">
        <h3>Progression des points</h3>
        <span>Cumul sur les matchs terminés</span>
      </div>
      <Suspense
        fallback={<div className="progression-chart progression-chart--loading">Chargement du graphe...</div>}
      >
        <ProgressionChartView
          data={chartData}
          showLeader={showLeader}
          leaderPseudo={progression.leaderPseudo}
        />
      </Suspense>
    </div>
  );
}

function GroupCard({
  group,
  currentUserId,
  busyAction,
  onJoin,
  onLeave,
  onDeleteGroup,
  onRemoveMember
}: {
  group: Group;
  currentUserId: string;
  busyAction: string;
  onJoin?: () => void;
  onLeave?: () => void;
  onDeleteGroup?: () => void;
  onRemoveMember?: (userId: string) => void;
}) {
  const isBusyWithGroup = busyAction.startsWith(`/api/groups/${group.id}`);
  const members = group.members ?? [];
  const [copied, setCopied] = useState<"code" | "link" | "">("");

  function confirmDeleteGroup() {
    if (!onDeleteGroup) return;
    const confirmed = window.confirm(`Supprimer le groupe "${group.name}" ? Cette action est définitive.`);
    if (confirmed) onDeleteGroup();
  }

  function inviteLink(code: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/?join=${code}`;
  }

  async function copyToClipboard(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  return (
    <article className="group-card">
      <div className="group-card-header">
        <div className="group-card-title">
          <strong>{group.name}</strong>
          <span>
            {group.memberCount} membre{group.memberCount > 1 ? "s" : ""} · créé par {group.ownerPseudo}
          </span>
        </div>
        {group.isOwner && <span className="status-chip success">Créateur</span>}
      </div>
      {group.isMember && group.inviteCode ? (
        <div className="group-invite">
          <div className="group-invite-code">
            <span className="eyebrow">Code d'invitation</span>
            <strong>{group.inviteCode}</strong>
          </div>
          <div className="group-invite-actions">
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => copyToClipboard(group.inviteCode as string, "code")}
            >
              {copied === "code" ? <Check size={14} /> : null}
              {copied === "code" ? "Copié" : "Copier le code"}
            </button>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => copyToClipboard(inviteLink(group.inviteCode as string), "link")}
            >
              {copied === "link" ? <Check size={14} /> : <Link2 size={14} />}
              {copied === "link" ? "Copié" : "Copier le lien"}
            </button>
          </div>
        </div>
      ) : null}
      {members.length ? (
        <div className="group-members">
          <div className="group-members-heading">
            <span>Membres</span>
            {group.isOwner && members.length > 1 && <span>Gestion</span>}
          </div>
          {members.map((member) => (
            <div key={member.userId} className="group-member-row">
              <span className="group-member-name">{member.pseudo}</span>
              {member.role === "owner" ? (
                <span className="group-member-role">Créateur</span>
              ) : (
                <span className="group-member-role">Membre</span>
              )}
              {group.isOwner && member.userId !== currentUserId && onRemoveMember && (
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={busyAction === `/api/groups/${group.id}/members/${member.userId}`}
                  onClick={() => onRemoveMember(member.userId)}
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div className="group-card-actions">
        {onJoin && (
          <button
            className="primary-button"
            type="button"
            disabled={busyAction === `/api/groups/${group.id}/join`}
            onClick={onJoin}
          >
            Rejoindre
          </button>
        )}
        {onLeave && !group.isOwner && (
          <button
            className="secondary-button"
            type="button"
            disabled={busyAction === `/api/groups/${group.id}/leave`}
            onClick={onLeave}
          >
            Quitter
          </button>
        )}
        {onDeleteGroup && group.isOwner && (
          <button
            className="danger-button"
            type="button"
            disabled={isBusyWithGroup}
            onClick={confirmDeleteGroup}
          >
            <Trash2 size={16} />
            Supprimer le groupe
          </button>
        )}
      </div>
    </article>
  );
}

function Results() {
  const { data, error, reload, loading } = useResource<{ results: Match[] }>("/api/results");
  const [view, setView] = useState<"matches" | "poules" | "bracket">("matches");

  const results = data?.results ?? EMPTY_MATCHES;
  const standings = useMemo(() => computeGroupStandings(results), [results]);

  if (loading && !data) return <ShellState label="Chargement des résultats..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const predicted = results.filter((match) => match.prediction);
  const totalPoints = predicted.reduce((sum, match) => sum + (match.prediction?.points ?? 0), 0);
  const exactScores = predicted.filter((match) => match.prediction?.exactScore).length;
  // Les matchs les plus récents d'abord : on voit le dernier résultat en haut,
  // pas le premier match de la compétition.
  const orderedResults = [...results].sort(
    (a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt)
  );
  const groupedResults = orderedResults.reduce<Array<{ day: string; matches: Match[] }>>(
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
    <section className="content-section">
      <SectionTitle title="Résultats" action={<RefreshButton onClick={reload} />} />
      <div className="period-toggle results-view-toggle" role="group" aria-label="Affichage des résultats">
        <button
          type="button"
          className={view === "matches" ? "active" : ""}
          aria-pressed={view === "matches"}
          onClick={() => setView("matches")}
        >
          Matchs
        </button>
        <button
          type="button"
          className={view === "poules" ? "active" : ""}
          aria-pressed={view === "poules"}
          onClick={() => setView("poules")}
        >
          Poules
        </button>
        <button
          type="button"
          className={view === "bracket" ? "active" : ""}
          aria-pressed={view === "bracket"}
          onClick={() => setView("bracket")}
        >
          Tableau final
        </button>
      </div>
      {view === "bracket" ? (
        <BracketView />
      ) : view === "matches" ? (
        results.length ? (
          <>
            <div className="prediction-summary" aria-label="Résumé des résultats">
              <Metric label="Matchs joués" value={String(results.length)} />
              <Metric label="Points gagnés" value={String(totalPoints)} />
              <Metric label="Scores exacts" value={String(exactScores)} />
            </div>
            <div className="prediction-day-list">
              {groupedResults.map((group) => (
                <section className="prediction-day" key={group.day}>
                  <div className="prediction-day-header">
                    <h2>{formatDay(group.day)}</h2>
                    <span className="status-chip">
                      {group.matches.length} match{group.matches.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="match-list">
                    {group.matches.map((match) => (
                      <MatchLine key={match.id} match={match} showResult />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <EmptyState text="Aucun match terminé pour l'instant. Reviens après les premiers coups de sifflet final." />
        )
      ) : (
        <GroupStandingsView standings={standings} />
      )}
    </section>
  );
}

// Reference stable pour le fallback de `useResource`, afin que le useMemo des
// classements ne se recalcule pas a chaque rendu pendant le chargement.
const EMPTY_MATCHES: Match[] = [];

function formatGoalDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}

function GroupStandingsView({ standings }: { standings: GroupStanding[] }) {
  const teamLabel = useTeamLabel();
  // Les 8 meilleurs 3es (toutes poules confondues) qui se qualifient pour les 16es :
  // `qualified` = garantis, `contested` = a egalite parfaite sur la ligne de qualif.
  const bestThirds = useMemo(() => computeBestThirds(standings), [standings]);
  // Tant que les 12 poules ne sont pas finies, ce classement reste provisoire.
  const thirdsConfirmed = useMemo(() => isGroupStageComplete(standings), [standings]);
  const hasContestedThirds = bestThirds.contested.size > 0;

  if (standings.length === 0) {
    return (
      <EmptyState text="Les classements des poules apparaîtront dès les premiers matchs terminés." />
    );
  }

  return (
    <div className="standings-list">
      <p className="standings-legend" aria-label="Légende des couleurs du classement">
        <span className="standings-legend-item">
          <span className="standings-legend-swatch standings-legend-swatch--qualified" aria-hidden="true" />
          Qualifié (1er-2e)
        </span>
        <span className="standings-legend-item">
          <span className="standings-legend-swatch standings-legend-swatch--third" aria-hidden="true" />
          {thirdsConfirmed ? "Meilleur 3e (8 repêchés)" : "Meilleurs 3es (provisoire)"}
        </span>
        {hasContestedThirds && (
          <span className="standings-legend-item">
            <span className="standings-legend-swatch standings-legend-swatch--contested" aria-hidden="true" />
            3e à départager
          </span>
        )}
      </p>
      {standings.map((standing) => (
        <section className="standings-group" key={standing.group}>
          <h2 className="standings-group-title">Groupe {groupLetter(standing.group)}</h2>
          <div className="standings-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th scope="col" className="standings-rank">#</th>
                  <th scope="col" className="standings-team">Équipe</th>
                  <th scope="col" title="Joués">J</th>
                  <th scope="col" title="Gagnés">G</th>
                  <th scope="col" title="Nuls">N</th>
                  <th scope="col" title="Perdus">P</th>
                  <th scope="col" title="Différence de buts">Diff</th>
                  <th scope="col" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standing.rows.map((row, index) => {
                  const isThird = index === 2;
                  const rowClass =
                    index < 2
                      ? "qualified"
                      : isThird && bestThirds.qualified.has(row.team)
                        ? "best-third"
                        : isThird && bestThirds.contested.has(row.team)
                          ? "best-third best-third--contested"
                          : "";
                  return (
                    <tr key={row.team} className={rowClass}>
                      <td className="standings-rank">{index + 1}</td>
                      <td className="standings-team">
                        {teamFlag(row.team) && <span className="team-flag">{teamFlag(row.team)}</span>}
                        <span>{teamLabel(row.team)}</span>
                      </td>
                      <td>{row.played}</td>
                      <td>{row.won}</td>
                      <td>{row.drawn}</td>
                      <td>{row.lost}</td>
                      <td>{formatGoalDiff(row.goalDiff)}</td>
                      <td className="standings-points">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function isMatchFinished(match: Match): boolean {
  return match.status === "FINISHED" || match.status === "AWARDED";
}

// Phase finale presentee tour par tour : une colonne par tour (16es -> finale),
// avec scroll horizontal sur petit ecran. On n'affiche pas de chemins de
// progression (la filiation entre matchs n'est pas fournie par la source).
// Charge sa propre ressource a l'affichage de la vue.
function BracketView() {
  const { data, error, reload, loading } = useResource<{ matches: Match[] }>("/api/bracket");
  const teamLabel = useTeamLabel();
  const matches = data?.matches ?? EMPTY_MATCHES;
  const rounds = useMemo(() => buildBracketRounds(matches), [matches]);

  if (loading) return <ShellState label="Chargement de la phase finale..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (rounds.length === 0) {
    return (
      <EmptyState text="Les matchs de la phase finale apparaîtront dès qu'ils seront programmés." />
    );
  }

  return (
    <div className="bracket-scroll">
      <p className="bracket-caption">Phase finale, tour par tour — des 16es à la finale.</p>
      <div className="bracket">
        {rounds.map((round) => (
          <section
            className="bracket-round"
            key={round.order}
            aria-label={knockoutRoundLabel(round.stage)}
          >
            <h2 className="bracket-round-title">{knockoutRoundLabel(round.stage)}</h2>
            <div className="bracket-round-matches">
              {round.matches.map((match) => {
                const done = isMatchFinished(match);
                const homeWon = done && match.winnerTeam === match.homeTeam;
                const awayWon = done && match.winnerTeam === match.awayTeam;
                return (
                  <article className="bracket-match" key={match.id}>
                    <div className={`bracket-team${homeWon ? " winner" : ""}`}>
                      <span className="bracket-team-name">
                        {teamFlag(match.homeTeam) && (
                          <span className="team-flag">{teamFlag(match.homeTeam)}</span>
                        )}
                        <span>{teamLabel(match.homeTeam)}</span>
                      </span>
                      <span className="bracket-team-score">{done ? match.homeScore : ""}</span>
                    </div>
                    <div className={`bracket-team${awayWon ? " winner" : ""}`}>
                      <span className="bracket-team-name">
                        {teamFlag(match.awayTeam) && (
                          <span className="team-flag">{teamFlag(match.awayTeam)}</span>
                        )}
                        <span>{teamLabel(match.awayTeam)}</span>
                      </span>
                      <span className="bracket-team-score">{done ? match.awayScore : ""}</span>
                    </div>
                    <div className="bracket-match-foot">
                      <span className="bracket-match-date">{formatDate(match.kickoffAt)}</span>
                      {(match.tvChannels ?? []).length > 0 && (
                        <span className="bracket-match-channels">
                          {(match.tvChannels ?? []).map((channel) => (
                            <ChannelLogo key={channel.key} channel={channel} />
                          ))}
                        </span>
                      )}
                      {match.prediction && done && (
                        <span className="status-chip success">{match.prediction.points} pts</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

type NotificationSettings = {
  email: string;
  enabled: boolean;
  verified: boolean;
};

function Profile({
  user,
  language,
  onLanguageChange,
  theme,
  onThemeChange
}: {
  user: User;
  language: Language;
  onLanguageChange: (language: Language) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const matchesResource = useResource<{ matches: Match[] }>("/api/matches");
  const profileResource = useResource<{ profile: UserProfile; badges: ProfileBadge[]; groups: Group[] }>(
    "/api/profile",
    [user.id]
  );
  const groupsResource = useResource<{ groups: Group[] }>("/api/groups");
  const notificationsResource = useResource<{ notifications: NotificationSettings }>(
    "/api/notifications",
    [user.id]
  );
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [groupAction, setGroupAction] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifEmail, setNotifEmail] = useState("");
  const [notifVerified, setNotifVerified] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");
  const [notifError, setNotifError] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
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

  useEffect(() => {
    const settings = notificationsResource.data?.notifications;
    if (settings) {
      setNotifEnabled(settings.enabled);
      setNotifEmail(settings.email);
      setNotifVerified(settings.verified);
    }
    setNotifMessage("");
    setNotifError("");
  }, [notificationsResource.data]);

  async function saveNotifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotifMessage("");
    setNotifError("");
    setNotifSaving(true);
    try {
      const response = await api<{ notifications: NotificationSettings }>("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ email: notifEmail, enabled: notifEnabled })
      });
      setNotifEnabled(response.notifications.enabled);
      setNotifEmail(response.notifications.email);
      setNotifVerified(response.notifications.verified);
      if (response.notifications.enabled && !response.notifications.verified) {
        setNotifMessage("Email envoyé : clique le lien de confirmation dans ta boîte mail.");
      } else if (response.notifications.enabled) {
        setNotifMessage("Notifications actives.");
      } else {
        setNotifMessage("Notifications désactivées.");
      }
    } catch (error) {
      setNotifError(error instanceof Error ? error.message : "Impossible d'enregistrer les notifications.");
    } finally {
      setNotifSaving(false);
    }
  }

  function updateProfile(update: Partial<UserProfile>) {
    setProfile((current) => ({ ...current, ...update }));
    setSaved(false);
    setSaveError("");
  }

  async function changePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPinMessage("");
    setPinError("");
    if (newPin !== confirmPin) {
      setPinError("Le nouveau PIN et sa confirmation ne correspondent pas.");
      return;
    }
    setPinSaving(true);
    try {
      await api("/api/profile/pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin })
      });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinMessage("PIN mis à jour. Utilise-le à ta prochaine connexion.");
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "Impossible de changer le PIN.");
    } finally {
      setPinSaving(false);
    }
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

  async function refreshGroups() {
    await Promise.all([groupsResource.reload(), profileResource.reload()]);
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupMessage("");
    setGroupAction("create");
    try {
      await api<{ groups: Group[] }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: groupName })
      });
      setGroupName("");
      setGroupMessage("Groupe créé.");
      await refreshGroups();
    } catch (error) {
      setGroupMessage(error instanceof Error ? error.message : "Impossible de créer le groupe.");
    } finally {
      setGroupAction("");
    }
  }

  async function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupMessage("");
    setGroupAction("join-by-code");
    try {
      const response = await api<{ groups: Group[]; joinedGroupName: string }>(
        "/api/groups/join-by-code",
        {
          method: "POST",
          body: JSON.stringify({ code: joinCode })
        }
      );
      setJoinCode("");
      setGroupMessage(`Tu as rejoint "${response.joinedGroupName}".`);
      await refreshGroups();
    } catch (error) {
      setGroupMessage(error instanceof Error ? error.message : "Code d'invitation invalide.");
    } finally {
      setGroupAction("");
    }
  }

  async function runGroupAction(path: string, method: "POST" | "DELETE", successMessage: string) {
    setGroupMessage("");
    setGroupAction(path);
    try {
      await api<{ groups: Group[] }>(path, { method });
      setGroupMessage(successMessage);
      await refreshGroups();
    } catch (error) {
      setGroupMessage(error instanceof Error ? error.message : "Action groupe impossible.");
    } finally {
      setGroupAction("");
    }
  }

  if (profileResource.loading) return <ShellState label="Chargement du profil..." />;
  if (profileResource.error) {
    return <ErrorState error={profileResource.error} onRetry={profileResource.reload} />;
  }

  const groups = groupsResource.data?.groups ?? profileResource.data?.groups ?? [];
  const myGroups = groups.filter((group) => group.isMember);
  const joinableGroups = groups.filter((group) => !group.isMember);

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
              Favori : {profile.favoriteTeam ? translateTeam(profile.favoriteTeam, language) : "Non renseigné"}
            </span>
            <span>
              <ClipboardList size={16} />
              {predictionStats.submittedPredictions} pronos posés
            </span>
          </div>
        </div>
      </section>

      <BadgesSection badges={profileResource.data?.badges ?? []} />

      <section className="content-section profile-edit-section">
        <SectionTitle title="Profil" />
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

      <section className="content-section notifications-section">
        <SectionTitle title="Notifications" />
        <p className="section-subtitle">
          Active les rappels par email pour recevoir un message avant chaque match dont le prono n'est pas encore posé, avec le lien direct vers l'app.
        </p>
        <form className="profile-form" onSubmit={saveNotifications}>
          <label className="preference-row">
            <span>
              <Bell size={16} />
              Recevoir les rappels par email
            </span>
            <input
              type="checkbox"
              checked={notifEnabled}
              onChange={(event) => setNotifEnabled(event.target.checked)}
            />
          </label>
          <label>
            <span>
              <Sparkles size={16} />
              Adresse email
            </span>
            <input
              type="email"
              value={notifEmail}
              onChange={(event) => setNotifEmail(event.target.value)}
              maxLength={254}
              placeholder="ton.email@exemple.com"
              required={notifEnabled}
            />
          </label>
          {notifEnabled && notifEmail && (
            <p className="section-subtitle">
              {notifVerified
                ? "Email confirmé : tu recevras tes rappels."
                : "Email à confirmer : vérifie ta boîte mail et clique le lien."}
            </p>
          )}
          {notifError && <p className="form-error">{notifError}</p>}
          <button className="primary-button" type="submit" disabled={notifSaving}>
            <Save size={18} />
            {notifSaving ? "Enregistrement..." : "Enregistrer les notifications"}
          </button>
          {notifMessage && <p className="inline-message">{notifMessage}</p>}
        </form>
      </section>

      <section className="content-section security-section">
        <SectionTitle title="Sécurité" />
        <p className="section-subtitle">
          Change ton code PIN de connexion. Il te faudra ton PIN actuel pour le modifier.
        </p>
        <form className="profile-form" onSubmit={changePin}>
          <label>
            <span>
              <Lock size={16} />
              PIN actuel
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={currentPin}
              onChange={(event) => setCurrentPin(event.target.value)}
              minLength={4}
              maxLength={8}
              pattern="\d{4,8}"
              placeholder="••••"
              required
            />
          </label>
          <label>
            <span>
              <ShieldCheck size={16} />
              Nouveau PIN (4 à 8 chiffres)
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value)}
              minLength={4}
              maxLength={8}
              pattern="\d{4,8}"
              placeholder="••••"
              required
            />
          </label>
          <label>
            <span>
              <ShieldCheck size={16} />
              Confirme le nouveau PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value)}
              minLength={4}
              maxLength={8}
              pattern="\d{4,8}"
              placeholder="••••"
              required
            />
          </label>
          {pinError && <p className="form-error">{pinError}</p>}
          <button className="primary-button" type="submit" disabled={pinSaving}>
            <Save size={18} />
            {pinSaving ? "Enregistrement..." : "Changer le PIN"}
          </button>
          {pinMessage && <p className="inline-message">{pinMessage}</p>}
        </form>
      </section>

      <section className="content-section preferences-section">
        <SectionTitle title="Préférences" />
        <label className="preference-row">
          <span>
            <Palette size={16} />
            Thème de l'app
          </span>
          <select
            aria-label="Choisir le thème"
            value={theme}
            onChange={(event) => {
              if (isThemeMode(event.target.value)) onThemeChange(event.target.value);
            }}
          >
            {themeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="preference-row">
          <span>
            <Languages size={16} />
            Langue des noms d'équipes
          </span>
          <select
            aria-label="Choisir la langue"
            value={language}
            onChange={(event) => {
              if (isLanguage(event.target.value)) onLanguageChange(event.target.value);
            }}
          >
            {languageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="section-subtitle">
          Personnalise l'apparence et la langue d'affichage des équipes (ex : « Allemagne » ou « Germany »). Les réglages s'appliquent à toute l'app.
        </p>
      </section>

      <section className="content-section groups-section">
        <SectionTitle title="Groupes" action={<RefreshButton onClick={refreshGroups} />} />
        <form className="group-create-form" onSubmit={createGroup}>
          <label>
            <span>Créer un groupe</span>
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              minLength={2}
              maxLength={36}
              placeholder="Ex: Bureau, Famille, Five du jeudi"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={groupAction === "create"}>
            {groupAction === "create" ? "Création..." : "Créer"}
          </button>
        </form>
        <form className="group-create-form" onSubmit={joinByCode}>
          <label>
            <span>Rejoindre avec un code</span>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              maxLength={12}
              placeholder="Ex: 7KQ4MP"
              autoCapitalize="characters"
              required
            />
          </label>
          <button className="secondary-button" type="submit" disabled={groupAction === "join-by-code"}>
            {groupAction === "join-by-code" ? "Validation..." : "Rejoindre via le code"}
          </button>
        </form>
        {groupMessage && (
          <p
            className={
              /impossible|déjà|invalide|aucun groupe/i.test(groupMessage) ? "form-error" : "inline-message"
            }
          >
            {groupMessage}
          </p>
        )}
        <div className="groups-layout">
          <div className="group-column">
            <h3>Mes groupes</h3>
            {myGroups.length ? (
              <div className="group-list">
                {myGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    currentUserId={user.id}
                    busyAction={groupAction}
                    onLeave={() => runGroupAction(`/api/groups/${group.id}/leave`, "POST", "Groupe quitté.")}
                    onDeleteGroup={() => runGroupAction(`/api/groups/${group.id}`, "DELETE", "Groupe supprimé.")}
                    onRemoveMember={(memberUserId) =>
                      runGroupAction(
                        `/api/groups/${group.id}/members/${memberUserId}`,
                        "DELETE",
                        "Membre retiré."
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState text="Tu n'as rejoint aucun groupe." />
            )}
          </div>
          <div className="group-column">
            <h3>Groupes existants</h3>
            {joinableGroups.length ? (
              <div className="group-list">
                {joinableGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    currentUserId={user.id}
                    busyAction={groupAction}
                    onJoin={() => runGroupAction(`/api/groups/${group.id}/join`, "POST", "Groupe rejoint.")}
                  />
                ))}
              </div>
            ) : (
              <EmptyState text="Aucun autre groupe disponible." />
            )}
          </div>
        </div>
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
  groups: Group[];
  rank: number | null;
};

function PublicProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data, error, reload, loading } = useResource<PublicProfileData>(
    `/api/users/${userId}/profile`,
    [userId]
  );
  const teamLabel = useTeamLabel();

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
              Favori : {data.profile.favoriteTeam ? teamLabel(data.profile.favoriteTeam) : "Non renseigné"}
            </span>
          </div>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          Retour classement
        </button>
      </section>

      <BadgesSection badges={data.badges} />

      <section className="content-section groups-section">
        <SectionTitle title="Groupes" />
        {data.groups.length ? (
          <div className="public-group-list">
            {data.groups.map((group) => (
              <div key={group.id} className="public-group-item">
                <strong>{group.name}</strong>
                <span>
                  {group.memberCount} membre{group.memberCount > 1 ? "s" : ""} · créé par {group.ownerPseudo}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="Ce joueur n'a rejoint aucun groupe." />
        )}
      </section>

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
            <strong>{data.profile.favoriteTeam ? teamLabel(data.profile.favoriteTeam) : "-"}</strong>
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

// Petit badge "logo" de chaine : texte de marque colore via CSS (.channel-logo--m6
// / --bein). Pas d'asset reseau externe ; un vrai SVG/PNG pourra le remplacer.
function ChannelLogo({ channel }: { channel: { key: string; label: string } }) {
  return (
    <span
      className={`channel-logo channel-logo--${channel.key.toLowerCase()}`}
      title={`Diffusé sur ${channel.label}`}
    >
      {channel.label}
    </span>
  );
}

// Ligne meta "stade + chaine(s) TV" affichee sous l'eyebrow d'un match. Tolere les
// anciens payloads (champs absents) et s'efface si aucune info n'est disponible.
function MatchBroadcast({ match, compact = false }: { match: Match; compact?: boolean }) {
  const channels = match.tvChannels ?? [];
  const venue = match.venue ?? "";
  if (!venue && channels.length === 0) return null;
  return (
    <span className={`match-broadcast${compact ? " compact" : ""}`}>
      {venue && (
        <span className="match-venue">
          <MapPin size={12} aria-hidden="true" />
          <span>{venue}</span>
        </span>
      )}
      {channels.length > 0 && (
        <span className="match-channels" aria-label={`Diffusion : ${channels.map((c) => c.label).join(", ")}`}>
          {channels.map((channel) => (
            <ChannelLogo key={channel.key} channel={channel} />
          ))}
        </span>
      )}
    </span>
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
  const teamLabel = useTeamLabel();
  const homeTeam = teamLabel(match.homeTeam);
  const awayTeam = teamLabel(match.awayTeam);
  const soon = !compact && isMatchSoon(match);
  const stateClass = compact ? "" : ` ${predictionStateClass(match)}${soon ? " soon" : ""}`;
  return (
    <article className={`match-line${compact ? " compact" : ""}${stateClass}`}>
      <div>
        <span className="eyebrow">{stageLabel(match)} · {formatDate(match.kickoffAt)}</span>
        <strong className="match-teams" aria-hidden="true">
          <span className="match-team">
            {teamFlag(match.homeTeam) && <span className="team-flag">{teamFlag(match.homeTeam)}</span>}
            <span>{homeTeam}</span>
          </span>
          <span className="match-separator">-</span>
          <span className="match-team">
            {teamFlag(match.awayTeam) && <span className="team-flag">{teamFlag(match.awayTeam)}</span>}
            <span>{awayTeam}</span>
          </span>
        </strong>
        <span className="visually-hidden">{homeTeam} - {awayTeam}</span>
        <MatchBroadcast match={match} compact={compact} />
      </div>
      <div className="match-meta">
        {soon && <span className="status-chip warn">Bientôt</span>}
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
      {showResult && match.leaguePredictions && match.leaguePredictions.length > 0 && (
        <p className="match-league-scores" aria-label="Scores les plus pronostiqués par la ligue">
          <span className="match-league-scores-label">Pronos ligue</span>
          {match.leaguePredictions.map((scoreline) => (
            <span key={`${scoreline.home}-${scoreline.away}`} className="match-league-score">
              {scoreline.home}-{scoreline.away}
              <small>×{scoreline.count}</small>
            </span>
          ))}
        </p>
      )}
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

function ThemeSelector({
  theme,
  onChange
}: {
  theme: ThemeMode;
  onChange: (theme: ThemeMode) => void;
}) {
  return (
    <label className="theme-toggle theme-select" title="Thème de couleurs">
      <Palette size={18} />
      <span className="visually-hidden">Thème</span>
      <select
        aria-label="Choisir le thème"
        value={theme}
        onChange={(event) => {
          if (isThemeMode(event.target.value)) {
            onChange(event.target.value);
          }
        }}
      >
        {themeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
