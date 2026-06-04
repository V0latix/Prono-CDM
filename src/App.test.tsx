import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { LeaderboardRow, Match, ProfileBadge } from "./api";
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
  it("shows registration without invitation code and submits only pseudo and PIN", async () => {
    const { calls } = installFetchMock([
      { path: "/api/me", body: { user: null } },
      { method: "POST", path: "/api/auth/register", body: { user } },
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

    await browserUser.type(screen.getByLabelText("Pseudo"), "Romain");
    await browserUser.type(screen.getByLabelText("Code PIN"), "1234");
    await browserUser.click(screen.getByRole("button", { name: /créer mon compte/i }));

    await screen.findByText("Romain");
    const registerCall = calls.find((call) => call.url === "/api/auth/register");
    expect(registerCall).toBeDefined();
    expect(JSON.parse(String(registerCall?.init?.body))).toEqual({
      pseudo: "Romain",
      pin: "1234"
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
    await browserUser.type(screen.getByLabelText("Code PIN"), "9999");
    await browserUser.click(screen.getByRole("button", { name: /me connecter/i }));

    expect(await screen.findByText("Pseudo ou PIN incorrect.")).toBeInTheDocument();
  });

  it("renders dashboard data and navigates to leaderboard and rules", async () => {
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
          rank: 2
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    expect(await screen.findAllByText("France - Argentine")).toHaveLength(2);
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

    await browserUser.click(screen.getByRole("button", { name: /règlement/i }));
    expect(await screen.findByText("Verrouillage")).toBeInTheDocument();
    expect(screen.getByText(/La phase finale double le barème/)).toBeInTheDocument();
    expect(screen.queryByText(/matchs à enjeu/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Le plan gratuit football-data.org/)).toBeInTheDocument();
    expect(screen.queryByText("Élimination directe")).not.toBeInTheDocument();
    expect(screen.queryByText(/Worker/i)).not.toBeInTheDocument();
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

    expect((await screen.findAllByText("Switzerland")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Germany").length).toBeGreaterThan(0);
    expect(screen.getByText("🇨🇭")).toBeInTheDocument();
    expect(screen.getByText("🇩🇪")).toBeInTheDocument();
  });

  it("groups predictions by day and allows updating a saved prediction before kickoff", async () => {
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

  it("shows an empty waiting state in the results tab for now", async () => {
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
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await screen.findByRole("heading", { name: "Dashboard" });
    await browserUser.click(screen.getByRole("button", { name: /résultats/i }));

    expect(screen.getByText("Résultats en attente.")).toBeInTheDocument();
    expect(screen.queryByText("Matchs terminés")).not.toBeInTheDocument();
    expect(screen.queryByText("Gestion à venir")).not.toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/results")).toBe(false);
  });

  it("selects and persists a high contrast theme", async () => {
    window.localStorage.clear();
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
    expect(document.documentElement.dataset.theme).toBe("light");

    const selector = screen.getByRole("combobox", { name: "Choisir le thème" });
    expect(screen.getByRole("option", { name: "Contraste" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Électrique" })).toBeInTheDocument();

    await browserUser.selectOptions(selector, "electric");
    expect(document.documentElement.dataset.theme).toBe("electric");
    expect(window.localStorage.getItem("prono-cdm-theme")).toBe("electric");
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
          badges: profileBadges()
        }
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
          badges: profileBadges()
        }
      }
    ]);
    const browserUser = userEvent.setup();

    render(<App />);

    await browserUser.click(await screen.findByRole("button", { name: /romain/i }));
    expect(await screen.findByRole("heading", { name: "Profil" })).toBeInTheDocument();
    expect(screen.getByText("Profil joueur")).toBeInTheDocument();

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
