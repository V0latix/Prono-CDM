import { useEffect, useState } from "react";
import { fetchTdfLeaderboard } from "./api";

type LeaderboardEntry = { user_id: string; pseudo: string; points: number };

export default function TdfLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTdfLeaderboard()
      .then((data) => setEntries(data.leaderboard))
      .catch(() => setError("Impossible de charger le classement."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="shell-state">Chargement du classement…</div>;
  if (error)
    return (
      <div className="empty-state error-state">
        <span>{error}</span>
        <button type="button" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    );

  if (entries.length === 0)
    return (
      <div className="empty-state">
        <p>Aucun résultat pour le moment.</p>
      </div>
    );

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Classement</h2>
      </div>
      <div className="leaderboard-table">
        <div
          className="leaderboard-row"
          style={{ background: "var(--surface)", fontWeight: 800, minHeight: "2.5rem" }}
          aria-hidden="true"
        >
          <span className="rank">#</span>
          <span />
          <span>Joueur</span>
          <span>Points</span>
        </div>
        {entries.map((entry, i) => (
          <div key={entry.user_id} className="leaderboard-row">
            <span className="rank">{i + 1}</span>
            <span className="leaderboard-avatar">{entry.pseudo.charAt(0).toUpperCase()}</span>
            <span className="leaderboard-player">
              <strong>{entry.pseudo}</strong>
            </span>
            <span>
              <strong>{entry.points}</strong> pt{entry.points !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
