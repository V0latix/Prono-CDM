import { useEffect, useState } from "react";
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

function StageRoute({ stage }: { stage: TdfStage }) {
  const cols = stage.cols ?? [];
  return (
    <details className="tdf-route-item">
      <summary className="tdf-route-summary">
        <span className="tdf-stage-no">Étape {stage.stage_no}</span>
        <span className="tdf-route-label">{stage.label || "—"}</span>
        <span className="tdf-route-type">{TYPE_LABEL[stage.type] ?? stage.type}</span>
      </summary>

      <div className="tdf-route-body">
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
    </details>
  );
}

export default function StageRouteSection() {
  const [stages, setStages] = useState<TdfStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTdfStages()
      .then((data) => setStages(data.stages))
      .catch(() => setError("Impossible de charger les parcours."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Parcours des étapes</h2>
      </div>
      <p className="section-subtitle">
        Profil de chaque étape et points distribués pour les maillots vert et à pois.
      </p>

      {loading && <p className="form-notice">Chargement des parcours…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && stages.length === 0 && (
        <p className="section-subtitle">Aucune étape disponible pour le moment.</p>
      )}

      <div className="tdf-route-list">
        {stages.map((stage) => (
          <StageRoute key={stage.stage_no} stage={stage} />
        ))}
      </div>
    </section>
  );
}
