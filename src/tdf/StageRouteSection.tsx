import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchTdfStages } from "./api";
import type { TdfStage } from "./api";
import StageProfile from "./StageProfile";

// Étape "du jour ou suivante" : la première dont la date n'est pas passée.
export function defaultIndex(
  stages: TdfStage[],
  today = new Date().toISOString().slice(0, 10)
): number {
  const i = stages.findIndex((s) => s.date >= today);
  return i >= 0 ? i : Math.max(0, stages.length - 1);
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
