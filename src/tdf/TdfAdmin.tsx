import { useState } from "react";
import { api } from "../api";

export default function TdfAdmin() {
  const [stageNo, setStageNo] = useState("");
  const [top, setTop] = useState<string[]>(Array(10).fill(""));
  const [combative, setCombative] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const rankLabel = (i: number) => {
    if (i === 0) return "1er";
    if (i === 1) return "2e";
    if (i === 2) return "3e";
    return `${i + 1}e`;
  };

  const submit = async () => {
    setMsg("");
    setError("");
    setLoading(true);
    try {
      const top10 = top
        .map((riderId, i) => ({ rank: i + 1, riderId: riderId.trim() }))
        .filter((r) => r.riderId);
      await api("/api/admin/tdf/stage-result", {
        method: "POST",
        body: JSON.stringify({
          stageNo: Number(stageNo),
          top10,
          combativeId: combative.trim() || null,
        }),
      });
      setMsg("Résultat enregistré.");
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Saisie résultat d'étape</h2>
      </div>
      <p className="section-subtitle">
        Saisie ou correction du résultat d'une étape. La re-soumission écrase l'entrée précédente.
      </p>

      <div className="form-group">
        <label htmlFor="tdf-admin-stage-no">Étape</label>
        <input
          id="tdf-admin-stage-no"
          aria-label="étape"
          type="number"
          min="1"
          max="21"
          value={stageNo}
          onChange={(e) => setStageNo(e.target.value)}
          placeholder="Numéro d'étape"
          className="form-input"
        />
      </div>

      <div className="section-title" style={{ marginTop: "1rem" }}>
        <h3>Top 10</h3>
      </div>

      {top.map((v, i) => (
        <div className="form-group" key={i}>
          <label htmlFor={`tdf-admin-rank-${i}`}>{rankLabel(i)}</label>
          <input
            id={`tdf-admin-rank-${i}`}
            aria-label={rankLabel(i)}
            type="text"
            value={v}
            onChange={(e) =>
              setTop((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))
            }
            placeholder={`Identifiant coureur (rang ${i + 1})`}
            className="form-input"
          />
        </div>
      ))}

      <div className="form-group" style={{ marginTop: "1rem" }}>
        <label htmlFor="tdf-admin-combative">Combatif</label>
        <input
          id="tdf-admin-combative"
          aria-label="combatif"
          type="text"
          value={combative}
          onChange={(e) => setCombative(e.target.value)}
          placeholder="Identifiant du coureur le plus combatif"
          className="form-input"
        />
      </div>

      <button
        type="button"
        className="primary-button"
        onClick={submit}
        disabled={loading || !stageNo}
      >
        {loading ? "Enregistrement…" : "Enregistrer le résultat"}
      </button>

      {msg && <p className="form-notice" style={{ color: "var(--color-success, green)" }}>{msg}</p>}
      {error && <p className="form-notice" style={{ color: "var(--color-error, red)" }}>{error}</p>}
    </section>
  );
}
