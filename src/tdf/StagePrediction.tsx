import { useEffect, useMemo, useState } from "react";
import { fetchTdfRiders, saveTdfStagePrediction } from "./api";
import type { TdfRider, TdfStage } from "./api";
import { RiderFilterBar, useRiderFilter } from "./RiderFilterBar";
import StageProfile from "./StageProfile";

export default function StagePrediction({ stage }: { stage: TdfStage }) {
  const [riders, setRiders] = useState<TdfRider[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [combativeId, setCombativeId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const filter = useRiderFilter(riders);
  const selectedRiders = useMemo(
    () => selected.map((id) => riders.find((r) => r.id === id)).filter(Boolean) as TdfRider[],
    [selected, riders]
  );

  const locked = useMemo(
    () => new Date(stage.lock_at).getTime() <= Date.now(),
    [stage.lock_at]
  );

  useEffect(() => {
    fetchTdfRiders()
      .then((r) => setRiders(r.riders))
      .catch(() => setLoadError("Impossible de charger les coureurs."));
  }, []);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 10 ? [...cur, id] : cur
    );
  }

  async function submit() {
    setStatus("saving");
    try {
      await saveTdfStagePrediction(stage.stage_no, selected, combativeId);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const lockDate = new Date(stage.lock_at).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>
          Étape {stage.stage_no} — {stage.label}
        </h2>
      </div>

      {locked ? (
        <p className="form-notice" role="status">
          Ce prono est verrouillé depuis le {lockDate}.
        </p>
      ) : (
        <p className="section-subtitle">
          Choisis 10 coureurs ({selected.length}/10) et 1 combatif. Verrou : {lockDate}.
        </p>
      )}

      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}

      {(stage.profile_image_url || (stage.cols && stage.cols.length > 0)) && (
        <details className="tdf-prono-profile" open>
          <summary>Profil de l'étape</summary>
          <StageProfile stage={stage} showMeta={false} />
        </details>
      )}

      {!locked && selectedRiders.length > 0 && (
        <div className="tdf-selected-chips" aria-label="Coureurs sélectionnés">
          {selectedRiders.map((r) => (
            <button
              key={r.id}
              type="button"
              className="tdf-chip"
              aria-label={`Retirer ${r.name}`}
              onClick={() => toggle(r.id)}
            >
              {r.name} ✕
            </button>
          ))}
        </div>
      )}

      {!locked && <RiderFilterBar state={filter} />}

      <ul className="tdf-rider-list" aria-label="Liste des coureurs">
        {filter.filtered.map((r) => (
          <li key={r.id} className="tdf-rider-row">
            <button
              type="button"
              className={`tdf-rider-btn${selected.includes(r.id) ? " selected" : ""}`}
              aria-pressed={selected.includes(r.id)}
              aria-label={r.name}
              disabled={locked}
              onClick={() => toggle(r.id)}
            >
              {r.name}
              {r.team && (
                <span className="tdf-rider-team">
                  {r.team}
                  {r.nationality ? ` · ${r.nationality}` : ""}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`tdf-combative-btn${combativeId === r.id ? " selected" : ""}`}
              aria-label={`combatif ${r.name}`}
              aria-pressed={combativeId === r.id}
              title="Choisir comme combatif"
              disabled={locked}
              onClick={() => setCombativeId(combativeId === r.id ? null : r.id)}
            >
              ⚔
            </button>
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="tdf-submit-row">
          <button
            type="button"
            className="primary-button"
            disabled={selected.length !== 10 || locked || status === "saving"}
            onClick={submit}
          >
            {status === "saving" ? "Enregistrement…" : "Valider mon prono"}
          </button>
          {status === "saved" && (
            <p className="form-notice" role="status">
              Prono enregistré.
            </p>
          )}
          {status === "error" && (
            <p className="form-error" role="alert">
              Erreur, réessaie.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
