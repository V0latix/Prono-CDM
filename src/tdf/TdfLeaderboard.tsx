import { useEffect, useState } from "react";
import { fetchTdfLeaderboard } from "./api";
import type { TdfLeaderboardEntry } from "./api";

const RANK_MARK = ["🟡", "🥈", "🥉"];

export default function TdfLeaderboard() {
  const [entries, setEntries] = useState<TdfLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchTdfLeaderboard()
      .then((data) => setEntries(data.leaderboard))
      .catch(() => setError("Impossible de charger le classement."))
      .finally(() => setLoading(false));
  }, [retryCount]);

  if (loading) return <div className="shell-state">Chargement du classement…</div>;
  if (error)
    return (
      <div className="empty-state error-state">
        <span>{error}</span>
        <button type="button" onClick={() => setRetryCount((c) => c + 1)}>
          Réessayer
        </button>
      </div>
    );

  if (entries.length === 0)
    return (
      <div className="empty-state">
        <p>Personne n'a encore fait de prono. Sois le premier à enfiler le maillot jaune !</p>
      </div>
    );

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Classement</h2>
      </div>
      <ol className="tdf-lb">
        {entries.map((entry, i) => (
          <li key={entry.user_id} className={`tdf-lb-row${i === 0 ? " leader" : ""}`}>
            <span className="tdf-lb-rank" aria-label={`${i + 1}e`}>
              {RANK_MARK[i] ?? i + 1}
            </span>
            <span className="tdf-lb-avatar" aria-hidden="true">
              {entry.pseudo.charAt(0).toUpperCase()}
            </span>
            <span className="tdf-lb-id">
              <strong>{entry.pseudo}</strong>
              <small>
                {entry.stages_played} étape{entry.stages_played !== 1 ? "s" : ""} jouée
                {entry.stages_played !== 1 ? "s" : ""}
                {entry.best_stage > 0 ? ` · meilleure ${entry.best_stage} pts` : ""}
              </small>
            </span>
            <span className="tdf-lb-breakdown">
              <span>
                <b>{entry.stage_points}</b> étapes
              </span>
              <span>
                <b>{entry.grand_depart_points}</b> grand départ
              </span>
            </span>
            <span className="tdf-lb-total">
              <strong>{entry.points}</strong> pt{entry.points !== 1 ? "s" : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
