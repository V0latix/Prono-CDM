import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, NEWS_STORAGE_KEY, NEWS_VERSION, releaseNotes } from "./App";
import type { Group, LeaderboardRow, Match, ProfileBadge } from "./api";
import { installFetchMock } from "./test/fetchMock";

const user = { id: "user-1", pseudo: "Romain" };
const syncStatus = {
  status: "success" as const,
  lastStartedAt: "2026-06-04T10:00:00.000Z",
  lastFinishedAt: "2026-06-04T10:00:01.000Z",
  lastSuccessAt: "2026-06-04T10:00:01.000Z",
  lastError: null,
  lastSyncedMatches: 104
};

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    homeTeam: "France",
    awayTeam: "Argentine",
    kickoffAt: "2026-06-15T19:00:00.000Z",
    stage: "GROUP_STAGE",
    stageKind: "GROUP",
    group: "GROUP_A",
    venue: null,
    tvChannels: [],
    status: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    winnerTeam: null,
    lastSyncedAt: "2026-06-04T10:00:00.000Z",
    locked: false,
    prediction: null,
    ...overrides
  };
}

function leaderboardRow(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    userId: "user-1",
    pseudo: "Romain",
    points: 12,
    exactScores: 2,
    correctResults: 1,
    correctGoalDiffs: 1,
    rank: 1,
    rankChange: 0,
    recentForm: ["exact", "correct", "miss", "bonus", "exact"],
    photoUrl: "",
    tagline: "Prêt à viser le score exact.",
    favoriteTeam: "France",
    submittedPredictions: 8,
    averagePoints: 2.4,
    successRate: 60,
    ...overrides
  };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Bureau",
    ownerUserId: "user-1",
    ownerPseudo: "Romain",
    memberCount: 2,
    isMember: true,
    isOwner: true,
    inviteCode: "7KQ4MP",
    createdAt: "2026-06-04T10:00:00.000Z",
    members: [
      { userId: "user-1", pseudo: "Romain", role: "owner", joinedAt: "2026-06-04T10:00:00.000Z" },
      { userId: "user-2", pseudo: "Marie", role: "member", joinedAt: "2026-06-04T10:01:00.000Z" }
    ],
    ...overrides
  };
}

function profileBadges(overrides: Partial<ProfileBadge>[] = []): ProfileBadge[] {
  const badges: ProfileBadge[] = [
    {
      id: "first_exact",
      label: "Premier score exact",
      description: "A trouvé au moins un score exact.",
      earned: true
    },
    {
      id: "correct_streak_3",
      label: "Série de 3 bons résultats",
      description: "A enchaîné trois matchs réussis.",
      earned: false
    },
    {
      id: "last_minute",
      label: "Dernière minute",
      description: "A posé un prono dans l'heure avant le coup d'envoi.",
      earned: true
    },
    {
      id: "perfect_day",
      label: "Sans faute sur une journée",
      description: "A réussi tous les matchs d'une journée terminée.",
      earned: false
    }
  ];

  return badges.map((badge, index) => ({ ...badge, ...overrides[index] }));
}

describe("App components", () => {
  // Par défaut on marque les nouveautés comme déjà vues pour éviter que le
  // pop-up de nouveautés ne s'ouvre dans les parcours non liés.
  beforeEach(() => {
    window.localStorage.setItem(NEWS_STORAGE_KEY, NEWS_VERSION);
  });

  // Certains tests s'appuient sur des matchs a date fixe (15-16 juin 2026) et
  // supposent que "maintenant" tombe avant le coup d'envoi (bandeau compte a
  // rebours, prono encore modifiable). On gele l'horloge dans ces tests pour les
  // rendre deterministes quelle que soit la date d'execution. On ne fake que
  // `Date` : les vrais timers restent actifs pour userEvent / findBy.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows registration without invitation code and submits only pseudo and PIN", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user: null } },
      { method: "POST", path: "/api/auth/register", body: { user } },
      {
        method: "PUT",
        path: "/api/profile",
        body: {
          profile: {
            photoUrl: "",
            tagline: "La remontada commence maintenant.",
            favoriteTeam: "France",
            updatedAt: "2026-06-04T10:00:00.000Z"
          },
          badges: []
        }
      },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: leaderboardRow({ points: 0, exactScores: 0, correctResults: 0 }),
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    expect(await screen.findByText("Inscription")).toBeInTheDocument();
    expect(screen.queryByLabelText(/invitation/i)).not.toBeInTheDocument();
    expect(screen.getByText("4 à 8 chiffres")).toBeInTheDocument();

    await browserUser.type(screen.getByLabelText("Pseudo"), "Romain");
    await browserUser.type(screen.getByLabelText(/Code PIN/), "1234");
    await browserUser.click(screen.getByRole("button", { name: /créer mon compte/i }));

    expect(await screen.findByText("Création du profil")).toBeInTheDocument();
    await browserUser.clear(screen.getByLabelText(/phrase d'accroche/i));
    await browserUser.type(screen.getByLabelText(/phrase d'accroche/i), "La remontada commence maintenant.");
    await browserUser.click(screen.getByRole("radio", { name: "Bleu blanc rouge" }));
    await browserUser.click(screen.getByRole("button", { name: /créer mon profil/i }));

    await screen.findByRole("heading", { name: "Dashboard" });
    const registerCall = calls.find((call) => call.url === "/api/auth/register");
    expect(registerCall).toBeDefined();
    expect(JSON.parse(String(registerCall?.init?.body))).toEqual({
      pseudo: "Romain",
      pin: "1234"
    });
    const profileCall = calls.find((call) => call.url === "/api/profile" && call.init?.method === "PUT");
    expect(profileCall).toBeDefined();
    expect(JSON.parse(String(profileCall?.init?.body))).toEqual({
      photoUrl: "",
      tagline: "La remontada commence maintenant.",
      favoriteTeam: "France"
    });
    expect(window.localStorage.getItem("prono-cdm-theme")).toBe("france");
  });

  it("enables email notifications from the profile setup screen", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user: null } },
      { method: "POST", path: "/api/auth/register", body: { user } },
      {
        method: "PUT",
        path: "/api/profile",
        body: {
          profile: { photoUrl: "", tagline: "", favoriteTeam: "", updatedAt: null },
          badges: []
        }
      },
      {
        method: "PUT",
        path: "/api/notifications",
        body: { notifications: { email: "joueur@example.com", enabled: true, verified: false } }
      },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByText("Inscription");
    await browserUser.type(screen.getByLabelText("Pseudo"), "Romain");
    await browserUser.type(screen.getByLabelText(/Code PIN/), "1234");
    await browserUser.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await screen.findByText("Création du profil");
    await browserUser.click(screen.getByRole("checkbox", { name: /rappels par email/i }));
    await browserUser.type(
      screen.getByRole("textbox", { name: /adresse email pour les rappels/i }),
      "joueur@example.com"
    );
    await browserUser.click(screen.getByRole("button", { name: /créer mon profil/i }));

    await screen.findByRole("heading", { name: "Dashboard" });
    const notifCall = calls.find(
      (call) => call.url === "/api/notifications" && call.init?.method === "PUT"
    );
    expect(notifCall).toBeDefined();
    expect(JSON.parse(String(notifCall?.init?.body))).toEqual({
      email: "joueur@example.com",
      enabled: true
    });
  });

  it("switches to login and displays server authentication errors", async () => {
    installFetchMock([
      { path: "/api/me", body: { user: null } },
      {
        method: "POST",
        path: "/api/auth/login",
        status: 401,
        body: { error: "Pseudo ou PIN incorrect." }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: "Connexion" }));
    await browserUser.type(screen.getByLabelText("Pseudo"), "Marie");
    expect(screen.getByText("4 à 8 chiffres")).toBeInTheDocument();
    await browserUser.type(screen.getByLabelText(/Code PIN/), "9999");
    await browserUser.click(screen.getByRole("button", { name: /me connecter/i }));

    expect(await screen.findByText("Pseudo ou PIN incorrect.")).toBeInTheDocument();
  });

  it("renders dashboard data and navigates to leaderboard and rules", async () => {
    // Avant le coup d'envoi du 15/06 19:00 : France - Argentine doit s'afficher
    // dans le bandeau compte a rebours en plus des deux listes.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T08:00:00.000Z"));
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [match()],
          predictionDay: "2026-06-15",
          predictionDayMatches: [
            match({ id: "match-1" }),
            match({
              id: "match-2",
              homeTeam: "Maroc",
              awayTeam: "Japon",
              kickoffAt: "2026-06-15T22:00:00.000Z",
              prediction: {
                predictedHomeScore: 1,
                predictedAwayScore: 0,
                predictedWinnerTeam: "Maroc",
                points: 0,
                exactScore: false,
                correctResult: false,
                correctGoalDiff: false,
                updatedAt: "2026-06-04T10:00:00.000Z"
              }
            })
          ],
          rank: leaderboardRow(),
          activity: [
            { id: "a1", type: "exact_score", message: "Romain a trouvé le score exact", created_at: "2026-06-04" },
            { id: "a2", type: "new_leader", message: "Marie prend la tête du classement", created_at: "2026-06-04" },
            { id: "a3", type: "correct_streak", message: "Romain enchaîne 3 bons résultats", created_at: "2026-06-04" }
          ],
          syncStatus
        }
      },
      {
        path: "/api/leaderboard",
        body: {
          leaderboard: [
            leaderboardRow(),
            leaderboardRow({
              userId: "user-2",
              pseudo: "Marie",
              points: 8,
              exactScores: 1,
              correctResults: 2,
              rank: 2,
              tagline: "Toujours dans le bon wagon.",
              favoriteTeam: "Japon",
              submittedPredictions: 7,
              averagePoints: 2,
              successRate: 50
            })
          ]
        }
      },
      {
        path: "/api/groups",
        body: {
          groups: [
            group(),
            group({
              id: "group-2",
              name: "Famille",
              ownerUserId: "user-2",
              ownerPseudo: "Marie",
              memberCount: 1,
              isMember: false,
              isOwner: false,
              members: []
            })
          ]
        }
      },
      {
        path: "/api/users/user-2/profile",
        body: {
          user: { id: "user-2", pseudo: "Marie" },
          profile: {
            photoUrl: "",
            tagline: "Toujours dans le bon wagon.",
            favoriteTeam: "Japon",
            updatedAt: "2026-06-04T10:00:00.000Z"
          },
          stats: {
            submittedPredictions: 7,
            totalMatches: 104,
            totalPoints: 8,
            exactScores: 1,
            correctResults: 2,
            goalDiffBonuses: 1,
            averagePoints: 2,
            successRate: 50,
            groupPoints: 8,
            knockoutPoints: 0
          },
          badges: profileBadges(),
          groups: [
            group({
              id: "group-2",
              name: "Famille",
              ownerUserId: "user-2",
              ownerPseudo: "Marie",
              memberCount: 1,
              isMember: false,
              isOwner: false
            })
          ],
          rank: 2,
          predictions: [
            match({
              id: "marie-done",
              homeTeam: "Belgique",
              awayTeam: "Portugal",
              kickoffAt: "2026-06-12T19:00:00.000Z",
              status: "FINISHED",
              homeScore: 1,
              awayScore: 2,
              locked: true,
              prediction: {
                predictedHomeScore: 0,
                predictedAwayScore: 2,
                predictedWinnerTeam: null,
                points: 3,
                exactScore: false,
                correctResult: true,
                correctGoalDiff: false,
                updatedAt: "2026-06-12T10:00:00.000Z"
              }
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    // France - Argentine apparaît dans le bandeau compte à rebours, la liste du
    // jour de compétition et la liste des prochains matchs.
    expect(await screen.findAllByText("France - Argentine")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /poser mon prono/i })).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Synchronisé")).toBeInTheDocument();
    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.getByText("Prédictions à faire maintenant")).toBeInTheDocument();
    expect(screen.getByText("Maroc - Japon")).toBeInTheDocument();
    expect(screen.getAllByText("🇫🇷").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇦🇷").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇲🇦").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇯🇵").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 à compléter/)).toBeInTheDocument();
    expect(screen.getByText("Marie prend la tête du classement")).toBeInTheDocument();
    expect(screen.getByText("Romain enchaîne 3 bons résultats")).toBeInTheDocument();
    expect(
      screen.getByText("Activité").compareDocumentPosition(screen.getByText("Données matchs")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await browserUser.click(screen.getByRole("button", { name: /classement/i }));
    expect(await screen.findByText("Marie")).toBeInTheDocument();
    expect(screen.getByText("12 pts")).toBeInTheDocument();
    expect(screen.getByText("Toujours dans le bon wagon.")).toBeInTheDocument();
    expect(screen.getAllByText("Profil").length).toBeGreaterThan(0);

    await browserUser.click(screen.getByRole("button", { name: /marie/i }));
    expect(await screen.findByRole("heading", { name: "Profil joueur" })).toBeInTheDocument();
    expect(screen.getByText("Rang : #2")).toBeInTheDocument();
    expect(screen.getByText("Stats publiques")).toBeInTheDocument();
    expect(screen.getByText("Premier score exact")).toBeInTheDocument();
    // Les pronos passés du joueur sont visibles (match terminé + son prono).
    expect(screen.getByText("Pronos passés")).toBeInTheDocument();
    expect(screen.getByText("Belgique - Portugal")).toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: /règlement/i }));
    expect(await screen.findByText("Verrouillage")).toBeInTheDocument();
    expect(screen.getByText(/La phase finale double le barème/)).toBeInTheDocument();
    expect(screen.queryByText(/matchs à enjeu/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Le plan gratuit football-data.org/)).toBeInTheDocument();
    expect(screen.queryByText("Élimination directe")).not.toBeInTheDocument();
    expect(screen.queryByText(/Worker/i)).not.toBeInTheDocument();
  });

  it("shows the last calculated result card with earned points on the dashboard", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          lastResult: match({
            id: "match-done",
            homeTeam: "France",
            awayTeam: "Argentine",
            status: "FINISHED",
            homeScore: 2,
            awayScore: 1,
            locked: true,
            prediction: {
              predictedHomeScore: 2,
              predictedAwayScore: 1,
              predictedWinnerTeam: "France",
              points: 5,
              exactScore: true,
              correctResult: true,
              correctGoalDiff: true,
              updatedAt: "2026-06-04T10:00:00.000Z"
            }
          }),
          rank: leaderboardRow(),
          activity: [],
          syncStatus
        }
      }
    ]);

    render(<App />);

    expect(await screen.findByText("Dernier résultat")).toBeInTheDocument();
    expect(screen.getByText("+5 pts")).toBeInTheDocument();
  });

  it("shows the latest finished match in the dashboard card even without a prediction", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          // Match terminé sans prono du joueur : la carte doit l'afficher quand
          // même avec 0 point (et non retomber sur un match plus ancien).
          lastResult: match({
            id: "match-missed",
            homeTeam: "Maroc",
            awayTeam: "Japon",
            status: "FINISHED",
            homeScore: 1,
            awayScore: 0,
            locked: true,
            prediction: null
          }),
          rank: leaderboardRow(),
          activity: [],
          syncStatus
        }
      }
    ]);

    render(<App />);

    expect(await screen.findByText("Dernier résultat")).toBeInTheDocument();
    expect(screen.getByText("Maroc - Japon")).toBeInTheDocument();
    expect(screen.getByText("Sans prono")).toBeInTheDocument();
    expect(screen.getByText("+0 pts")).toBeInTheDocument();
  });

  it("switches the leaderboard to the weekly window", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          lastResult: null,
          rank: leaderboardRow(),
          activity: [],
          syncStatus
        }
      },
      { path: "/api/leaderboard", body: { leaderboard: [leaderboardRow()] } },
      { path: "/api/groups", body: { groups: [] } }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /classement/i }));
    expect(await screen.findByText("Classement général")).toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: /cette semaine/i }));

    expect(await screen.findByText("Classement de la semaine")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        calls.some((call) => call.url.includes("/api/leaderboard?") && call.url.includes("from="))
      ).toBe(true);
    });
  });

  it("shows locked predictions as non-editable", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "locked-1",
              locked: true,
              kickoffAt: "2026-06-01T19:00:00.000Z"
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    expect(await screen.findByText("France - Argentine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verrouillé/i })).toBeDisabled();
    expect(screen.getByLabelText("Score France")).toBeDisabled();
    expect(screen.getByLabelText("Score Argentine")).toBeDisabled();
  });

  it("renders flags for football-data English team names", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "swiss-1",
              homeTeam: "Switzerland",
              awayTeam: "Germany"
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    // Les noms anglais de football-data sont traduits en français par défaut,
    // mais les drapeaux restent reconnus à partir du nom d'origine.
    expect((await screen.findAllByText("Suisse")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Allemagne").length).toBeGreaterThan(0);
    expect(screen.getByText("🇨🇭")).toBeInTheDocument();
    expect(screen.getByText("🇩🇪")).toBeInTheDocument();
  });

  it("renders flags for teams previously missing or shown with the plain black flag", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "scot-bih",
              homeTeam: "Scotland",
              awayTeam: "Bosnia-Herzegovina"
            }),
            match({
              id: "cgo-cpv",
              homeTeam: "Congo DR",
              awayTeam: "Cape Verde Islands"
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    // Noms traduits en français...
    expect((await screen.findAllByText("Écosse")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bosnie-Herzégovine").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RD Congo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cap-Vert").length).toBeGreaterThan(0);
    // ...et drapeaux corrects : Écosse en drapeau régional (plus le 🏴 noir).
    expect(screen.getByText("🏴󠁧󠁢󠁳󠁣󠁴󠁿")).toBeInTheDocument();
    expect(screen.getByText("🇧🇦")).toBeInTheDocument();
    expect(screen.getByText("🇨🇩")).toBeInTheDocument();
    expect(screen.getByText("🇨🇻")).toBeInTheDocument();
    expect(screen.queryByText("🏴")).not.toBeInTheDocument();
  });

  it("groups predictions by day and allows updating a saved prediction before kickoff", async () => {
    // "avant le coup d'envoi" : on se place le matin du 15/06, donc les deux
    // matchs (15/06 19:00 et 16/06 16:00) sont a venir et encore modifiables.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T08:00:00.000Z"));
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "match-1",
              kickoffAt: "2026-06-15T19:00:00.000Z",
              prediction: {
                predictedHomeScore: 1,
                predictedAwayScore: 0,
                predictedWinnerTeam: "France",
                points: 0,
                exactScore: false,
                correctResult: false,
                correctGoalDiff: false,
                updatedAt: "2026-06-04T10:00:00.000Z"
              }
            }),
            match({
              id: "match-2",
              homeTeam: "Espagne",
              awayTeam: "Italie",
              kickoffAt: "2026-06-16T16:00:00.000Z"
            })
          ]
        }
      },
      {
        method: "PUT",
        path: "/api/predictions/match-1",
        body: { ok: true }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    expect(await screen.findByRole("heading", { name: /lundi 15 juin/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mardi 16 juin/i })).toBeInTheDocument();
    expect(screen.getByText("Enregistré")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /déjà enregistré/i })).toBeDisabled();

    const franceScore = screen.getByLabelText("Score France");
    await browserUser.clear(franceScore);
    await browserUser.type(franceScore, "2");
    await browserUser.click(screen.getByRole("button", { name: /mettre à jour/i }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/predictions/match-1")).toBe(true)
    );
    const saveCall = calls.find((call) => call.url === "/api/predictions/match-1");
    expect(JSON.parse(String(saveCall?.init?.body))).toEqual({
      predictedHomeScore: 2,
      predictedAwayScore: 0,
      predictedWinnerTeam: null
    });
  });

  it("masque les jours passés par défaut et les révèle via le bouton dans Mes pronos", async () => {
    // Dates relatives à maintenant pour rester indépendant de l'horloge réelle.
    const dayMs = 24 * 60 * 60 * 1000;
    const futureKickoff = new Date(Date.now() + 10 * dayMs).toISOString();
    const pastKickoff = new Date(Date.now() - 10 * dayMs).toISOString();
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "past-1",
              homeTeam: "Bresil",
              awayTeam: "Croatie",
              kickoffAt: pastKickoff,
              locked: true
            }),
            match({
              id: "future-1",
              kickoffAt: futureKickoff
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    // Le match à venir est visible, le match passé est replié par défaut.
    expect(await screen.findByText("France - Argentine")).toBeInTheDocument();
    expect(screen.queryByText("Bresil - Croatie")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /afficher les jours passés \(1\)/i });
    await browserUser.click(toggle);

    expect(screen.getByText("Bresil - Croatie")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /masquer les jours passés/i })
    ).toBeInTheDocument();
  });

  it("clears the score field on focus so typing replaces the leading zero", async () => {
    // Regression: sur mobile (iOS Safari/WebKit) `select()` au focus n'etait pas
    // honore, le 0 restait colle et saisir 3 donnait "30". Le champ se vide
    // desormais au focus : la saisie repart de zero sur tous les navigateurs.
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "match-1",
              homeTeam: "Bresil",
              awayTeam: "Croatie",
              kickoffAt: "2026-06-15T19:00:00.000Z"
            })
          ]
        }
      },
      { method: "PUT", path: "/api/predictions/match-1", body: { ok: true } }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    const bresilScore = await screen.findByLabelText("Score Bresil");
    expect(bresilScore).toHaveValue("0");
    // Un simple focus + saisie d'un chiffre, sans clear() prealable.
    await browserUser.click(bresilScore);
    await browserUser.type(bresilScore, "3");
    expect(bresilScore).toHaveValue("3");

    await browserUser.click(screen.getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/predictions/match-1")).toBe(true)
    );
    const saveCall = calls.find((call) => call.url === "/api/predictions/match-1");
    expect(JSON.parse(String(saveCall?.init?.body))).toEqual({
      predictedHomeScore: 3,
      predictedAwayScore: 0,
      predictedWinnerTeam: null
    });
  });

  it("restores the previous score when the field is focused then left empty", async () => {
    // Le champ se vide au focus ; si l'utilisateur n'ecrit rien et quitte le
    // champ, le score d'origine doit revenir (et ne pas etre ecrase par "0"/"").
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "match-1",
              kickoffAt: "2026-06-15T19:00:00.000Z",
              prediction: {
                predictedHomeScore: 3,
                predictedAwayScore: 1,
                predictedWinnerTeam: null,
                points: 0,
                exactScore: false,
                correctResult: false,
                correctGoalDiff: false,
                updatedAt: "2026-06-04T10:00:00.000Z"
              }
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    const franceScore = await screen.findByLabelText("Score France");
    expect(franceScore).toHaveValue("3");
    await browserUser.click(franceScore); // focus => le champ se vide
    expect(franceScore).toHaveValue("");
    await browserUser.tab(); // blur sans rien taper => restauration
    expect(franceScore).toHaveValue("3");
  });

  it("lists finished matches with the user prediction and earned points", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/results",
        body: {
          results: [
            match({
              id: "match-done",
              status: "FINISHED",
              homeScore: 2,
              awayScore: 1,
              locked: true,
              prediction: {
                predictedHomeScore: 2,
                predictedAwayScore: 1,
                predictedWinnerTeam: "France",
                points: 5,
                exactScore: true,
                correctResult: true,
                correctGoalDiff: true,
                updatedAt: "2026-06-04T10:00:00.000Z"
              }
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));

    expect(await screen.findByText("Points gagnés")).toBeInTheDocument();
    expect(screen.getByText("2-1 · 5 pts")).toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/results")).toBe(true);
  });

  it("affiche les scores les plus pronostiqués par la ligue sous un match terminé", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/results",
        body: {
          results: [
            match({
              id: "match-done",
              status: "FINISHED",
              homeScore: 2,
              awayScore: 0,
              locked: true,
              prediction: null,
              leaguePredictions: [
                { home: 2, away: 0, count: 8 },
                { home: 2, away: 1, count: 6 }
              ]
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));

    expect(await screen.findByText("Pronos ligue")).toBeInTheDocument();
    expect(screen.getByText("×8")).toBeInTheDocument();
    expect(screen.getByText("×6")).toBeInTheDocument();
  });

  it("affiche les résultats les plus récents en premier", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/results",
        body: {
          results: [
            match({
              id: "older",
              homeTeam: "Bresil",
              awayTeam: "Croatie",
              kickoffAt: "2026-06-10T19:00:00.000Z",
              status: "FINISHED",
              homeScore: 1,
              awayScore: 0,
              locked: true
            }),
            match({
              id: "newer",
              kickoffAt: "2026-06-12T19:00:00.000Z",
              status: "FINISHED",
              homeScore: 2,
              awayScore: 1,
              locked: true
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));

    const newer = await screen.findByText("France - Argentine");
    const older = screen.getByText("Bresil - Croatie");
    // Le match le plus récent (12/06) doit apparaître avant le plus ancien (10/06).
    expect(
      newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("affiche la phase finale en arbre avec la petite finale à part", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      { path: "/api/results", body: { results: [] } },
      {
        path: "/api/bracket",
        body: {
          matches: [
            match({
              id: "demi-1",
              homeTeam: "France",
              awayTeam: "Bresil",
              stage: "SEMI_FINALS",
              stageKind: "KNOCKOUT",
              kickoffAt: "2026-07-14T19:00:00.000Z"
            }),
            match({
              id: "finale",
              homeTeam: "Argentine",
              awayTeam: "Espagne",
              stage: "FINAL",
              stageKind: "KNOCKOUT",
              kickoffAt: "2026-07-19T19:00:00.000Z"
            }),
            match({
              id: "petite-finale",
              homeTeam: "Maroc",
              awayTeam: "Portugal",
              stage: "THIRD_PLACE",
              stageKind: "KNOCKOUT",
              kickoffAt: "2026-07-18T19:00:00.000Z"
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));
    await browserUser.click(screen.getByRole("button", { name: /tableau final/i }));

    // Les tours du championnat sont rendus dans l'entonnoir...
    expect(await screen.findByText("1/2 finale")).toBeInTheDocument();
    expect(screen.getByText("Finale")).toBeInTheDocument();
    // ...et la petite finale dans son bloc dédié, hors de l'arbre principal.
    const thirdPlaceTitle = screen.getByText("Petite finale");
    const thirdPlaceBlock = thirdPlaceTitle.closest(".bracket-third-place");
    expect(thirdPlaceBlock).not.toBeNull();
    expect(within(thirdPlaceBlock as HTMLElement).getByText("Maroc")).toBeInTheDocument();
    // Le match de petite finale n'est pas dans l'entonnoir .bracket.
    const funnel = document.querySelector(".bracket") as HTMLElement;
    expect(within(funnel).queryByText("Maroc")).toBeNull();
    expect(within(funnel).getByText("Argentine")).toBeInTheDocument();
  });

  it("affiche la courbe de progression dans le classement", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: leaderboardRow(),
          activity: [],
          syncStatus
        }
      },
      { path: "/api/leaderboard", body: { leaderboard: [leaderboardRow()] } },
      { path: "/api/groups", body: { groups: [] } },
      {
        path: "/api/stats/progression",
        body: {
          progression: {
            leaderUserId: "user-2",
            leaderPseudo: "Marie",
            playerCount: 3,
            points: [
              {
                matchId: "m1",
                kickoffAt: "2026-06-11T19:00:00.000Z",
                homeTeam: "France",
                awayTeam: "Japon",
                me: 3,
                leader: 5,
                average: 4
              }
            ]
          }
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /classement/i }));

    // La courbe est masquée par défaut.
    const toggle = await screen.findByRole("button", {
      name: /afficher la courbe de progression/i
    });
    expect(screen.queryByText("Progression des points")).not.toBeInTheDocument();

    // On l'affiche via le bouton dédié.
    await browserUser.click(toggle);
    expect(await screen.findByText("Progression des points")).toBeInTheDocument();
    expect(screen.getByText("Cumul sur les matchs terminés")).toBeInTheDocument();

    // Et on peut la masquer à nouveau.
    await browserUser.click(screen.getByRole("button", { name: /masquer la courbe/i }));
    expect(screen.queryByText("Progression des points")).not.toBeInTheDocument();
  });

  it("affiche un état vide de la courbe quand aucun match n'est terminé", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: leaderboardRow(),
          activity: [],
          syncStatus
        }
      },
      { path: "/api/leaderboard", body: { leaderboard: [leaderboardRow()] } },
      { path: "/api/groups", body: { groups: [] } },
      {
        path: "/api/stats/progression",
        body: {
          progression: {
            leaderUserId: null,
            leaderPseudo: null,
            playerCount: 0,
            points: []
          }
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /classement/i }));
    await browserUser.click(
      await screen.findByRole("button", { name: /afficher la courbe de progression/i })
    );

    expect(
      await screen.findByText(/La courbe des points cumulés apparaîtra/)
    ).toBeInTheDocument();
  });

  it("affiche le classement des poules dans l'onglet résultats", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/results",
        body: {
          results: [
            match({
              id: "r1",
              group: "GROUP_A",
              homeTeam: "France",
              awayTeam: "Canada",
              homeScore: 2,
              awayScore: 0,
              status: "FINISHED"
            }),
            match({
              id: "r2",
              group: "GROUP_A",
              homeTeam: "Maroc",
              awayTeam: "Mexique",
              homeScore: 1,
              awayScore: 1,
              status: "FINISHED"
            })
          ]
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));
    await browserUser.click(screen.getByRole("button", { name: "Poules" }));

    expect(await screen.findByText("Groupe A")).toBeInTheDocument();
    // France a gagné 2-0 (3 pts) : en tête de poule et donc qualifiée (top 2).
    const franceRow = screen.getByText("France").closest("tr");
    expect(franceRow).toHaveClass("qualified");
    // Colonnes buts marqués (bp) / encaissés (bc) affichées.
    expect(screen.getByRole("columnheader", { name: "bp" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "bc" })).toBeInTheDocument();
    // France : 2 marqués, 0 encaissé.
    const franceCells = within(franceRow as HTMLElement).getAllByRole("cell");
    // # | Équipe | J | G | N | P | bp | bc | Diff | Pts
    expect(franceCells[6]).toHaveTextContent("2");
    expect(franceCells[7]).toHaveTextContent("0");
  });

  it("shows an empty state in the results tab when no match is finished", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      { path: "/api/results", body: { results: [] } }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));

    expect(await screen.findByText(/Aucun match terminé/)).toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: "Poules" }));
    expect(await screen.findByText(/classements des poules apparaîtront/)).toBeInTheDocument();
  });

  it("selects and persists a requested app theme from the profile", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(NEWS_STORAGE_KEY, NEWS_VERSION);
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/profile",
        body: {
          profile: { photoUrl: "", tagline: "", favoriteTeam: "", updatedAt: null },
          badges: profileBadges(),
          groups: []
        }
      },
      { path: "/api/groups", body: { groups: [] } },
      { path: "/api/matches", body: { matches: [] } },
      {
        path: "/api/notifications",
        body: { notifications: { email: "", enabled: false, verified: false } }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(document.documentElement.dataset.theme).toBe("classic");

    await browserUser.click(await screen.findByRole("button", { name: /romain/i }));
    await screen.findByRole("heading", { level: 1, name: "Profil" });

    const selector = screen.getByRole("combobox", { name: "Choisir le thème" });
    expect(screen.getByRole("option", { name: "Mode gazon" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bleu blanc rouge" })).toBeInTheDocument();

    await browserUser.selectOptions(selector, "grass");
    expect(document.documentElement.dataset.theme).toBe("grass");
    expect(window.localStorage.getItem("prono-cdm-theme")).toBe("grass");
  });

  it("translates team names to French by default and switches language from the profile", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(NEWS_STORAGE_KEY, NEWS_VERSION);
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [match({ id: "m1", homeTeam: "Germany", awayTeam: "Brazil" })],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/profile",
        body: {
          profile: {
            photoUrl: "",
            tagline: "Prêt à viser le score exact.",
            favoriteTeam: "Germany",
            updatedAt: null
          },
          badges: profileBadges(),
          groups: []
        }
      },
      { path: "/api/groups", body: { groups: [] } },
      { path: "/api/matches", body: { matches: [] } },
      {
        path: "/api/notifications",
        body: { notifications: { email: "", enabled: false, verified: false } }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    // Par défaut (FR) les noms anglais de football-data sont traduits.
    expect(await screen.findAllByText("Allemagne - Brésil")).not.toHaveLength(0);
    expect(screen.queryByText("Germany - Brazil")).not.toBeInTheDocument();
    // Chaque match de poule indique son groupe.
    expect(screen.getAllByText(/Groupe A/).length).toBeGreaterThan(0);

    await browserUser.click(screen.getByRole("button", { name: /romain/i }));
    await screen.findByRole("heading", { level: 1, name: "Profil" });
    expect(screen.getByText(/Favori : Allemagne/)).toBeInTheDocument();

    await browserUser.selectOptions(
      screen.getByRole("combobox", { name: "Choisir la langue" }),
      "en"
    );

    expect(screen.getByText(/Favori : Germany/)).toBeInTheDocument();
    expect(screen.queryByText(/Favori : Allemagne/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("prono-cdm-language")).toBe("en");
  });

  it("enables email notifications from the profile and confirms the address is pending", async () => {
    window.localStorage.clear();
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/profile",
        body: {
          profile: { photoUrl: "", tagline: "", favoriteTeam: "", updatedAt: null },
          badges: profileBadges(),
          groups: []
        }
      },
      { path: "/api/groups", body: { groups: [] } },
      { path: "/api/matches", body: { matches: [] } },
      {
        path: "/api/notifications",
        body: { notifications: { email: "", enabled: false, verified: false } }
      },
      {
        method: "PUT",
        path: "/api/notifications",
        body: { notifications: { email: "joueur@example.com", enabled: true, verified: false } }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /romain/i }));
    await screen.findByRole("heading", { level: 1, name: "Profil" });

    await browserUser.click(
      screen.getByRole("checkbox", { name: /Recevoir les rappels par email/i })
    );
    await browserUser.type(
      screen.getByRole("textbox", { name: /Adresse email/i }),
      "joueur@example.com"
    );
    await browserUser.click(
      screen.getByRole("button", { name: /Enregistrer les notifications/i })
    );

    const putCall = await waitFor(() => {
      const call = calls.find(
        (entry) => entry.url === "/api/notifications" && entry.init?.method === "PUT"
      );
      expect(call).toBeTruthy();
      return call!;
    });
    expect(JSON.parse(String(putCall.init?.body))).toEqual({
      email: "joueur@example.com",
      enabled: true
    });
    expect(await screen.findByText(/clique le lien de confirmation/i)).toBeInTheDocument();
  });

  it("opens a small info bubble with recent app updates", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    expect(screen.queryByRole("region", { name: "Nouveautés de l'application" })).not.toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: "Nouveautés" }));
    const panel = screen.getByRole("region", { name: "Nouveautés de l'application" });
    expect(within(panel).getByText("Dernières nouveautés")).toBeInTheDocument();
    expect(within(panel).getByText("Nouveaux badges fun")).toBeInTheDocument();
    expect(within(panel).getByText("Thèmes plus lisibles")).toBeInTheDocument();
    expect(within(panel).getByText("Groupes entre amis")).toBeInTheDocument();
    expect(within(panel).queryByText(/preview|production|déploiement/i)).not.toBeInTheDocument();

    await browserUser.click(within(panel).getByRole("button", { name: "Fermer les nouveautés" }));
    expect(screen.queryByRole("region", { name: "Nouveautés de l'application" })).not.toBeInTheDocument();
  });

  it("shows the what's new pop-up on reopen and remembers it was dismissed", async () => {
    window.localStorage.removeItem(NEWS_STORAGE_KEY);
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: /nouveautés/i });
    // La modale liste les nouveautes les plus recentes : on verifie la note en tete
    // (robuste quand on ajoute de nouvelles release notes).
    expect(within(dialog).getByText(releaseNotes[0].title)).toBeInTheDocument();

    await browserUser.click(within(dialog).getByRole("button", { name: /c'est noté/i }));

    expect(screen.queryByRole("dialog", { name: /nouveautés/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(NEWS_STORAGE_KEY)).toBe(NEWS_VERSION);
  });

  it("marks the news button as unread until the pop-up is dismissed", async () => {
    window.localStorage.removeItem(NEWS_STORAGE_KEY);
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: /nouveautés/i });
    expect(screen.getByRole("button", { name: /nouveautés \(non lues\)/i })).toBeInTheDocument();

    await browserUser.click(within(dialog).getByRole("button", { name: /c'est noté/i }));

    expect(screen.queryByRole("button", { name: /non lues/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^nouveautés$/i })).toBeInTheDocument();
  });

  it("clears the unread mark when the news panel is opened from the bubble", async () => {
    window.localStorage.removeItem(NEWS_STORAGE_KEY);
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    // Ouvrir le panneau via la bulle non lue doit marquer les nouveautés comme vues.
    const bubble = await screen.findByRole("button", { name: /nouveautés \(non lues\)/i });
    await browserUser.click(bubble);

    expect(window.localStorage.getItem(NEWS_STORAGE_KEY)).toBe(NEWS_VERSION);
    expect(screen.queryByRole("button", { name: /non lues/i })).not.toBeInTheDocument();
  });

  it("returns to the login screen when an authed request expires the session", async () => {
    window.localStorage.setItem("prono-cdm-session-token", "stale-token");
    installFetchMock([
      { path: "/api/me", body: { user } },
      { path: "/api/dashboard", status: 401, body: { error: "Connexion requise." } }
    ]);

    render(<App />);

    // Le 401 sur le dashboard doit ramener a l'ecran de connexion, pas a un
    // "Reessayer" qui rejoue la meme requete en echec.
    expect(
      await screen.findByText("Ta session a expiré, reconnecte-toi.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connexion$/i })).toHaveClass("active");
    expect(screen.queryByRole("button", { name: /réessayer/i })).not.toBeInTheDocument();
    // Le token de fallback est purge pour ne pas re-tenter avec une session morte.
    expect(window.localStorage.getItem("prono-cdm-session-token")).toBeNull();
  });

  it("requires a qualified team for tied knockout predictions before saving", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "ko-1",
              stage: "FINAL",
              stageKind: "KNOCKOUT",
              locked: false
            })
          ]
        }
      },
      {
        method: "PUT",
        path: "/api/predictions/ko-1",
        body: { ok: true }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getAllByRole("button", { name: /mes pronos/i })[0]);

    const saveButton = await screen.findByRole("button", { name: /enregistrer/i });
    expect(saveButton).toBeDisabled();
    // Le libellé du tour de phase finale remplace le générique "Élimination directe".
    expect(screen.getByText(/Finale/)).toBeInTheDocument();

    await browserUser.selectOptions(screen.getByRole("combobox", { name: "Équipe qualifiée" }), "France");
    expect(saveButton).not.toBeDisabled();
    await browserUser.click(saveButton);

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/predictions/ko-1")).toBe(true)
    );
    const saveCall = calls.find((call) => call.url === "/api/predictions/ko-1");
    expect(JSON.parse(String(saveCall?.init?.body))).toEqual({
      predictedHomeScore: 0,
      predictedAwayScore: 0,
      predictedWinnerTeam: "France"
    });
  });

  it("can trigger a manual match synchronization from the dashboard", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus: { ...syncStatus, lastSyncedMatches: 0 }
        }
      },
      {
        method: "POST",
        path: "/api/admin/sync",
        body: {
          synced: 104,
          status: { ...syncStatus, lastSyncedMatches: 104 }
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /synchroniser/i }));
    expect(await screen.findByText("104 matchs synchronisés.")).toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/admin/sync")).toBe(true);
  });

  it("opens and saves the profile from the dashboard pseudo", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/profile",
        body: {
          profile: {
            photoUrl: "",
            tagline: "Prêt à viser le score exact.",
            favoriteTeam: "France",
            updatedAt: null
          },
          badges: profileBadges(),
          groups: [group()]
        }
      },
      {
        path: "/api/groups",
        body: {
          groups: [
            group(),
            group({
              id: "group-2",
              name: "Copains",
              ownerUserId: "user-2",
              ownerPseudo: "Marie",
              memberCount: 1,
              isMember: false,
              isOwner: false,
              members: []
            })
          ]
        }
      },
      {
        method: "POST",
        path: "/api/groups",
        body: { groups: [group({ id: "group-3", name: "Famille" })] }
      },
      {
        method: "POST",
        path: "/api/groups/group-2/join",
        body: { groups: [] }
      },
      {
        method: "DELETE",
        path: "/api/groups/group-1/members/user-2",
        body: { groups: [] }
      },
      {
        method: "DELETE",
        path: "/api/groups/group-1",
        body: { groups: [] }
      },
      {
        path: "/api/matches",
        body: {
          matches: [
            match({
              id: "finished-1",
              homeTeam: "France",
              awayTeam: "Brésil",
              status: "FINISHED",
              locked: true,
              homeScore: 2,
              awayScore: 1,
              prediction: {
                predictedHomeScore: 2,
                predictedAwayScore: 1,
                predictedWinnerTeam: "France",
                points: 5,
                exactScore: true,
                correctResult: true,
                correctGoalDiff: true,
                updatedAt: "2026-06-04T10:00:00.000Z"
              }
            }),
            match({
              id: "open-1",
              homeTeam: "Espagne",
              awayTeam: "Allemagne",
              kickoffAt: "2026-06-18T19:00:00.000Z"
            })
          ]
        }
      },
      {
        method: "PUT",
        path: "/api/profile",
        body: {
          profile: {
            photoUrl: "",
            tagline: "Le spécialiste du 2-1.",
            favoriteTeam: "Brésil",
            updatedAt: "2026-06-04T10:00:00.000Z"
          },
          badges: profileBadges(),
          groups: [group()]
        }
      }
    ]);
    const browserUser = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /romain/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Profil" })).toBeInTheDocument();
    expect(screen.getByText("Profil joueur")).toBeInTheDocument();
    expect(screen.getByText("Bureau")).toBeInTheDocument();
    expect(screen.getByText("Copains")).toBeInTheDocument();

    await browserUser.type(screen.getByPlaceholderText("Ex: Bureau, Famille, Five du jeudi"), "Famille");
    await browserUser.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/groups" && call.init?.method === "POST")).toBe(true));

    await browserUser.click(screen.getByRole("button", { name: "Rejoindre" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/groups/group-2/join")).toBe(true));

    await browserUser.click(screen.getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/groups/group-1/members/user-2")).toBe(true));

    await browserUser.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/groups/group-1" && call.init?.method === "DELETE")).toBe(true));

    const photo = new File(["avatar"], "avatar.png", { type: "image/png" });
    expect(screen.getByLabelText("Choisir une photo")).toHaveAttribute("accept", "image/*");
    await browserUser.upload(screen.getByLabelText("Choisir une photo"), photo);
    await waitFor(
      () => {
        const photoInput = screen.getByPlaceholderText("Ou colle une URL d'image") as HTMLInputElement;
        expect(photoInput.value).toMatch(/^data:image\/png;base64,/);
      },
      { timeout: 3000 }
    );
    await browserUser.clear(screen.getByLabelText(/phrase d'accroche/i));
    await browserUser.type(screen.getByLabelText(/phrase d'accroche/i), "Le spécialiste du 2-1.");
    await browserUser.clear(screen.getByLabelText(/favori de la compétition/i));
    await browserUser.type(screen.getByLabelText(/favori de la compétition/i), "Brésil");
    await browserUser.click(screen.getByRole("button", { name: /enregistrer mon profil/i }));

    expect(await screen.findByText("Profil enregistré.")).toBeInTheDocument();
    expect(screen.getByText("Favori : Brésil")).toBeInTheDocument();
    expect(screen.queryByText("Match préféré")).not.toBeInTheDocument();
    expect(screen.getByText("Badges")).toBeInTheDocument();
    expect(screen.getByText("Dernière minute")).toBeInTheDocument();
    expect(screen.getByText("Stats pronostics")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("2-1 (1x)")).toBeInTheDocument();
    expect(screen.getByText("Espagne - Allemagne")).toBeInTheDocument();
    const saveCall = calls.find((call) => call.url === "/api/profile" && call.init?.method === "PUT");
    expect(saveCall).toBeDefined();
    const saveBody = JSON.parse(String(saveCall?.init?.body));
    expect(saveBody.photoUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("shows the group invite code and joins another group by code", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: null,
          predictionDayMatches: [],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      {
        path: "/api/profile",
        body: {
          profile: {
            photoUrl: "",
            tagline: "Prêt à viser le score exact.",
            favoriteTeam: "France",
            updatedAt: null
          },
          badges: profileBadges(),
          groups: [group()]
        }
      },
      { path: "/api/groups", body: { groups: [group()] } },
      { path: "/api/matches", body: { matches: [] } },
      {
        method: "POST",
        path: "/api/groups/join-by-code",
        body: { joinedGroupName: "Les Bleus", groups: [group()] }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /romain/i }));
    expect(await screen.findByText("Code d'invitation")).toBeInTheDocument();
    expect(screen.getByText("7KQ4MP")).toBeInTheDocument();

    await browserUser.type(screen.getByPlaceholderText("Ex: 7KQ4MP"), "abc234");
    await browserUser.click(screen.getByRole("button", { name: "Rejoindre via le code" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/groups/join-by-code")).toBe(true)
    );
    const joinCall = calls.find((call) => call.url === "/api/groups/join-by-code");
    expect(JSON.parse(String(joinCall?.init?.body))).toEqual({ code: "abc234" });
    expect(await screen.findByText('Tu as rejoint "Les Bleus".')).toBeInTheDocument();
  });

  it("opens the predictions view from the next competition day section", async () => {
    installFetchMock([
      { path: "/api/me", body: { user } },
      {
        path: "/api/dashboard",
        body: {
          nextMatches: [],
          predictionDay: "2026-06-15",
          predictionDayMatches: [match()],
          rank: undefined,
          activity: [],
          syncStatus
        }
      },
      { path: "/api/matches", body: { matches: [match()] } }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    expect(await screen.findByText("Prédictions à faire maintenant")).toBeInTheDocument();
    const nextDaySection = screen
      .getByText("Prédictions à faire maintenant")
      .closest(".content-section");
    expect(nextDaySection).not.toBeNull();
    await browserUser.click(
      within(nextDaySection as HTMLElement).getByRole("button", { name: /mes pronos/i })
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Mes pronos" })).toBeInTheDocument();
    expect(screen.getByText("Sauvegarde un score exact, puis modifie-le librement jusqu'au coup d'envoi du match.")).toBeInTheDocument();
  });
});
