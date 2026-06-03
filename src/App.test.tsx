import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { Match } from "./api";
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
          rank: { userId: "user-1", pseudo: "Romain", points: 0, exactScores: 0, correctResults: 0, rank: 1 },
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
          rank: { userId: "user-1", pseudo: "Romain", points: 12, exactScores: 2, correctResults: 1, rank: 1 },
          activity: [{ id: "a1", type: "exact_score", message: "Romain a trouvé le score exact", created_at: "2026-06-04" }],
          syncStatus
        }
      },
      {
        path: "/api/leaderboard",
        body: {
          leaderboard: [
            { userId: "user-1", pseudo: "Romain", points: 12, exactScores: 2, correctResults: 1, rank: 1 },
            { userId: "user-2", pseudo: "Marie", points: 8, exactScores: 1, correctResults: 2, rank: 2 }
          ]
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
    expect(screen.getByText(/1 à compléter/)).toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: /classement/i }));
    expect(await screen.findByText("Marie")).toBeInTheDocument();
    expect(screen.getByText("12 pts")).toBeInTheDocument();

    await browserUser.click(screen.getByRole("button", { name: /règlement/i }));
    expect(await screen.findByText("Verrouillage")).toBeInTheDocument();
    expect(screen.getByText(/Le plan gratuit football-data.org/)).toBeInTheDocument();
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

    await browserUser.selectOptions(screen.getByRole("combobox"), "France");
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
    expect(await screen.findByRole("heading", { name: "Mes pronos" })).toBeInTheDocument();
    expect(screen.getByText("Tous les matchs")).toBeInTheDocument();
  });
});
