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

// Profil d'une étape : image officielle letour + points maillot vert / à pois.
// `showMeta` affiche la ligne type · date (utile dans le pager, redondant sous
// l'en-tête d'un prono d'étape).
export default function StageProfile({
  stage,
  showMeta = true
}: {
  stage: TdfStage;
  showMeta?: boolean;
}) {
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
      {showMeta && (
        <p className="section-subtitle tdf-route-meta">
          {TYPE_LABEL[stage.type] ?? stage.type}
          {dateLabel ? ` · ${dateLabel}` : ""}
        </p>
      )}

      {stage.profile_image_url || stage.cols_map_url ? (
        <div className="tdf-profile-pair">
          {stage.profile_image_url && (
            <figure className="tdf-profile-fig">
              <img
                className="tdf-route-profile"
                src={stage.profile_image_url}
                alt={`Profil de l'étape ${stage.stage_no}`}
                loading="lazy"
              />
              <figcaption>Profil de l'étape</figcaption>
            </figure>
          )}
          {stage.cols_map_url && (
            <figure className="tdf-profile-fig">
              <img
                className="tdf-route-profile"
                src={stage.cols_map_url}
                alt={`Carte des cols de l'étape ${stage.stage_no}`}
                loading="lazy"
              />
              <figcaption>Carte des cols</figcaption>
            </figure>
          )}
        </div>
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
