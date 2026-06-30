import { useEffect, useState } from "react";
import { fetchTdfResults, fetchTdfRiders } from "./api";
import type { TdfRider, TdfStage } from "./api";

type StageResult = { stage_no: number; rider_id: string; rank: number };

export default function TdfResults() {
  const [stages, setStages] = useState<TdfStage[]>([]);
  const [results, setResults] = useState<StageResult[]>([]);
  const [ridersMap, setRidersMap] = useState<Record<string, TdfRider>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetchTdfResults(), fetchTdfRiders()])
      .then(([resultsData, ridersData]) => {
        setStages(resultsData.stages);
        setResults(resultsData.results);
        const map: Record<string, TdfRider> = {};
        for (const r of ridersData.riders) map[r.id] = r;
        setRidersMap(map);
      })
      .catch(() => setError("Impossible de charger les résultats."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="shell-state">Chargement des résultats…</div>;
  if (error)
    return (
      <div className="empty-state error-state">
        <span>{error}</span>
      </div>
    );

  const finishedStages = stages.filter((s) => s.status === "finished");

  if (finishedStages.length === 0)
    return (
      <div className="empty-state">
        <p>Aucune étape terminée pour le moment.</p>
      </div>
    );

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Résultats</h2>
      </div>
      <div className="tdf-results-list">
        {finishedStages.map((stage) => {
          const stageResults = results
            .filter((r) => r.stage_no === stage.stage_no)
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 10);

          const combative =
            stage.combative_rider_id ? ridersMap[stage.combative_rider_id] : null;

          return (
            <div key={stage.stage_no} className="tdf-stage-result">
              <div className="prediction-day-header">
                <h3 className="tdf-stage-heading">
                  Étape {stage.stage_no} — {stage.label}
                </h3>
                <span className="eyebrow">
                  {new Date(stage.date).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short"
                  })}
                </span>
              </div>

              {stageResults.length === 0 ? (
                <p className="section-subtitle">Pas encore de classement disponible.</p>
              ) : (
                <ol className="tdf-top10-list">
                  {stageResults.map((r) => {
                    const rider = ridersMap[r.rider_id];
                    return (
                      <li key={r.rider_id} className="tdf-top10-row">
                        <span className="tdf-top10-rank">{r.rank}</span>
                        <span className="tdf-top10-name">
                          {rider ? rider.name : r.rider_id}
                          {rider?.team && (
                            <span className="tdf-rider-team">{rider.team}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {combative && (
                <p className="section-subtitle">
                  ⚔ Combatif : <strong>{combative.name}</strong>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
