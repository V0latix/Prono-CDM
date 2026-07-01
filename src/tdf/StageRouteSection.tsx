import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchTdfStages } from "./api";
import type { TdfStage } from "./api";
import {
  polkaPoints,
  greenFinishPoints,
  GREEN_SPRINT_POINTS
} from "../shared/tdf-jersey-points";

const TYPE_LABEL: Record<string, string> = {
  flat: "Plat",
  hilly: "Vallonnée",
  mountain: "Montagne",
  itt: "Contre-la-montre",
  ttt: "Contre-la-montre par équipes"
};

function catLabel(category: string | null): string {
  if (!category) return "Non catégorisé";
  return category === "HC" ? "Hors catégorie" : `Catégorie ${category}`;
}

// Étape "du jour ou suivante" : la première dont la date n'est pas passée.
export function defaultIndex(
  stages: TdfStage[],
  today = new Date().toISOString().slice(0, 10)
): number {
  const i = stages.findIndex((s) => s.date >= today);
  return i >= 0 ? i : Math.max(0, stages.length - 1);
}

function StageProfile({ stage }: { stage: TdfStage }) {
  const cols = stage.cols ?? [];
  const dateLabel = stage.date
    ? new Date(stage.date).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long"
      })
    : "";
  return (
    <div className="tdf-route-current">
      <p className="section-subtitle tdf-route-meta">
        {TYPE_LABEL[stage.type] ?? stage.type}
        {dateLabel ? ` · ${dateLabel}` : ""}
      </p>

      {stage.profile_image_url ? (
        <img
          className="tdf-route-profile"
          src={stage.profile_image_url}
          alt={`Profil de l'étape ${stage.stage_no}`}
          loading="lazy"
        />
      ) : (
        <p className="section-subtitle">Profil indisponible pour le moment.</p>
      )}

      <div className="tdf-jersey-block">
        <h4>🟢 Maillot vert</h4>
        <p>
          Arrivée : <strong>{greenFinishPoints(stage.type).join(" · ")}</strong>
        </p>
        <p>
          Sprint intermédiaire : <strong>{GREEN_SPRINT_POINTS.join(" · ")}</strong>
        </p>
      </div>

      <div className="tdf-jersey-block">
        <h4>🔴 Maillot à pois — cols traversés</h4>
        {cols.length === 0 ? (
          <p className="section-subtitle">Aucun col catégorisé sur cette étape.</p>
        ) : (
          <ul className="tdf-col-list">
            {cols.map((c, i) => (
              <li key={i} className="tdf-col-row">
                <span className="tdf-col-name">{c.name}</span>
                <span className="tdf-col-cat">{catLabel(c.category)}</span>
                <span className="tdf-col-points">
                  {c.category ? polkaPoints(c.category).join(" · ") : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function StageRouteSection() {
  const [stages, setStages] = useState<TdfStage[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTdfStages()
      .then((data) => {
        setStages(data.stages);
        setIndex(defaultIndex(data.stages));
      })
      .catch(() => setError("Impossible de charger les parcours."))
      .finally(() => setLoading(false));
  }, []);

  const current = stages[index];
  const canPrev = index > 0;
  const canNext = index < stages.length - 1;

  const header = useMemo(() => {
    if (!current) return "";
    return `Étape ${current.stage_no} — ${current.label || "—"}`;
  }, [current]);

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Parcours des étapes</h2>
      </div>

      {loading && <p className="form-notice">Chargement des parcours…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !current && (
        <p className="section-subtitle">Aucune étape disponible pour le moment.</p>
      )}

      {current && (
        <>
          <div className="tdf-route-nav">
            <button
              type="button"
              className="tdf-route-arrow"
              aria-label="Étape précédente"
              disabled={!canPrev}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={22} />
            </button>
            <div className="tdf-route-heading">
              <strong>{header}</strong>
              <small>Étape {current.stage_no} / {stages.length}</small>
            </div>
            <button
              type="button"
              className="tdf-route-arrow"
              aria-label="Étape suivante"
              disabled={!canNext}
              onClick={() => setIndex((i) => Math.min(stages.length - 1, i + 1))}
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <StageProfile stage={current} />
        </>
      )}
    </section>
  );
}
