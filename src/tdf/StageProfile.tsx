import { ExternalLink } from "lucide-react";
import type { TdfStage } from "./api";
import {
  polkaPoints,
  greenFinishPoints,
  GREEN_SPRINT_POINTS
} from "../shared/tdf-jersey-points";
import { colProfileUrl } from "./col-profile";

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
                <a
                  className="tdf-col-name tdf-col-link"
                  href={colProfileUrl(c.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Voir le profil de ${c.name}`}
                >
                  {c.name}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
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
