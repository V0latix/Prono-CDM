import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, ClipboardList, Medal, Scale, Settings, Trophy } from "lucide-react";
import type { User } from "../api";
import {
  fetchTdfDashboard,
  fetchTdfRiders,
  fetchTdfStages
} from "./api";
import type { TdfRider, TdfStage } from "./api";
import GrandDepart from "./GrandDepart";
import StagePrediction from "./StagePrediction";
import TdfAdmin from "./TdfAdmin";
import TdfLeaderboard from "./TdfLeaderboard";
import TdfResults from "./TdfResults";
import TdfRules from "./TdfRules";

type TdfView = "dashboard" | "predictions" | "leaderboard" | "results" | "rules" | "admin";

const tdfNavItems: Array<{ id: TdfView; label: string; icon: typeof CalendarClock; adminOnly?: boolean }> = [
  { id: "dashboard", label: "Dashboard", icon: CalendarClock },
  { id: "predictions", label: "Mes pronos", icon: ClipboardList },
  { id: "leaderboard", label: "Classement", icon: Trophy },
  { id: "results", label: "Résultats", icon: Medal },
  { id: "rules", label: "Règlement", icon: Scale },
  { id: "admin", label: "Admin", icon: Settings, adminOnly: true }
];

const tdfViewTitles: Record<TdfView, string> = {
  dashboard: "Dashboard",
  predictions: "Mes pronos",
  leaderboard: "Classement",
  results: "Résultats",
  rules: "Règlement",
  admin: "Admin"
};

// ── Dashboard ────────────────────────────────────────────────────────────────

function TdfDashboard({ onOpenPredictions }: { onOpenPredictions: () => void }) {
  const [nextStage, setNextStage] = useState<TdfStage | null | undefined>(undefined);
  const [myPrediction, setMyPrediction] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTdfDashboard()
      .then((data) => {
        setNextStage(data.nextStage);
        setMyPrediction(data.myPrediction);
      })
      .catch(() => setError("Impossible de charger le dashboard."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="shell-state">Chargement du dashboard…</div>;
  if (error)
    return (
      <div className="empty-state error-state">
        <span>{error}</span>
      </div>
    );

  return (
    <div className="view-grid">
      {nextStage ? (
        <section className="tdf-next-stage-card content-section">
          <div className="section-title">
            <h2>Prochaine étape</h2>
          </div>
          <p className="tdf-stage-label">
            <strong>Étape {nextStage.stage_no}</strong> — {nextStage.label}
          </p>
          <p className="section-subtitle">
            Départ :{" "}
            {new Date(nextStage.date).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long"
            })}{" "}
            · Verrou :{" "}
            {new Date(nextStage.lock_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
          {myPrediction ? (
            <p className="form-notice">Prono posé pour cette étape.</p>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={onOpenPredictions}
            >
              Poser mon prono
            </button>
          )}
        </section>
      ) : (
        <div className="empty-state">
          <p>Pas de prochaine étape pour le moment.</p>
        </div>
      )}
    </div>
  );
}

// ── Predictions ───────────────────────────────────────────────────────────────

function TdfPredictions() {
  const [stages, setStages] = useState<TdfStage[]>([]);
  const [riders, setRiders] = useState<TdfRider[]>([]);
  const [activeStage, setActiveStage] = useState<TdfStage | null>(null);
  const [showGrandDepart, setShowGrandDepart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchTdfStages(), fetchTdfRiders()])
      .then(([stagesData, ridersData]) => {
        setStages(stagesData.stages);
        setRiders(ridersData.riders);
        // Ouvrir automatiquement la prochaine étape à pronostiquer
        const next = stagesData.stages.find(
          (s) => s.status === "upcoming" && new Date(s.lock_at).getTime() > Date.now()
        );
        if (next) setActiveStage(next);
      })
      .catch(() => setError("Impossible de charger les étapes."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="shell-state">Chargement des étapes…</div>;
  if (error)
    return (
      <div className="empty-state error-state">
        <span>{error}</span>
      </div>
    );

  if (activeStage) {
    return (
      <div>
        <button
          type="button"
          className="secondary-button"
          style={{ marginBottom: "1rem" }}
          onClick={() => setActiveStage(null)}
        >
          ← Retour aux étapes
        </button>
        <StagePrediction stage={activeStage} />
      </div>
    );
  }

  if (showGrandDepart) {
    return (
      <div>
        <button
          type="button"
          className="secondary-button"
          style={{ marginBottom: "1rem" }}
          onClick={() => setShowGrandDepart(false)}
        >
          ← Retour
        </button>
        <GrandDepart riders={riders} />
      </div>
    );
  }

  return (
    <div>
      <section className="content-section">
        <div className="section-title">
          <h2>Grand Départ</h2>
        </div>
        <p className="section-subtitle">
          Pronostique le palmarès final avant le début de la course.
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowGrandDepart(true)}
        >
          Mes pronos Grand Départ
        </button>
      </section>

      <section className="content-section">
        <div className="section-title">
          <h2>Pronos par étape</h2>
        </div>
        {stages.length === 0 ? (
          <p className="section-subtitle">Aucune étape disponible.</p>
        ) : (
          <ul className="tdf-stage-list">
            {stages.map((stage) => {
              const isLocked = new Date(stage.lock_at).getTime() <= Date.now();
              return (
                <li key={stage.stage_no}>
                  <button
                    type="button"
                    className="tdf-stage-list-btn"
                    onClick={() => setActiveStage(stage)}
                  >
                    <span className="tdf-stage-no">Étape {stage.stage_no}</span>
                    <span className="tdf-stage-info">
                      {stage.label}
                      <span className="tdf-stage-date">
                        {new Date(stage.date).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short"
                        })}
                      </span>
                    </span>
                    <span className={`tdf-stage-lock${isLocked ? " locked" : ""}`}>
                      {isLocked ? "Verrouillé" : "Ouvert"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function TdfApp({ user, topbarActions }: { user: User; topbarActions?: ReactNode }) {
  const [view, setView] = useState<TdfView>("dashboard");
  const isAdmin = user.isAdmin === true;

  return (
    <div className="tdf-app">
      <header className="topbar tdf-topbar">
        <div>
          <p className="eyebrow">Tour de France 2026</p>
          <h1>{tdfViewTitles[view]}</h1>
        </div>
        {topbarActions}
      </header>

      <nav className="nav-list tdf-nav" aria-label="Navigation Tour de France">
        {tdfNavItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
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

      <div className="tdf-content">
        {view === "dashboard" && (
          <TdfDashboard onOpenPredictions={() => setView("predictions")} />
        )}
        {view === "predictions" && <TdfPredictions />}
        {view === "leaderboard" && <TdfLeaderboard />}
        {view === "results" && <TdfResults />}
        {view === "rules" && <TdfRules />}
        {view === "admin" && isAdmin && <TdfAdmin />}
      </div>
    </div>
  );
}
