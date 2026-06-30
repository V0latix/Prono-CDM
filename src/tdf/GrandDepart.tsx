import { useState } from "react";
import { saveTdfGrandDepart } from "./api";
import type { TdfRider, TdfGrandDepartPrediction } from "./api";

interface Props {
  riders: TdfRider[];
  locked?: boolean;
}

export default function GrandDepart({ riders, locked = false }: Props) {
  const [yellow, setYellow] = useState<(string | null)[]>([null, null, null]);
  const [white, setWhite] = useState<(string | null)[]>([null, null, null]);
  const [green, setGreen] = useState<string | null>(null);
  const [polka, setPolka] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function updatePodium(
    arr: (string | null)[],
    setArr: (v: (string | null)[]) => void,
    index: number,
    value: string | null
  ) {
    const next = [...arr];
    next[index] = value || null;
    setArr(next);
  }

  const canSubmit =
    !locked &&
    yellow.every(Boolean) &&
    white.every(Boolean) &&
    Boolean(green) &&
    Boolean(polka);

  async function submit() {
    setStatus("saving");
    const prediction: TdfGrandDepartPrediction = { yellow, white, green, polka };
    try {
      await saveTdfGrandDepart(prediction);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const youngRiders = riders.filter((r) => r.is_young === 1);
  const whitePool = youngRiders.length >= 3 ? youngRiders : riders;

  return (
    <section className="content-section">
      <div className="section-title">
        <h2>Grand Départ — Pronos généraux</h2>
      </div>
      <p className="section-subtitle">
        Choisis le podium final, le meilleur sprinter et le meilleur grimpeur.
      </p>

      {locked && (
        <p className="form-notice" role="status">
          Les pronos du Grand Départ sont verrouillés.
        </p>
      )}

      <div className="tdf-grand-depart-grid">
        <fieldset className="tdf-jersey-group" disabled={locked}>
          <legend className="tdf-jersey-label">
            <span className="tdf-jersey-icon">🟡</span> Podium général (maillot jaune)
          </legend>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tdf-podium-row">
              <span className="tdf-podium-rank">{i + 1}e</span>
              <select
                aria-label={`Jaune position ${i + 1}`}
                value={yellow[i] ?? ""}
                onChange={(e) => updatePodium(yellow, setYellow, i, e.target.value)}
              >
                <option value="">— choisir —</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.team ? ` (${r.team})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>

        <fieldset className="tdf-jersey-group" disabled={locked}>
          <legend className="tdf-jersey-label">
            <span className="tdf-jersey-icon">⚪</span> Podium jeunes (maillot blanc)
          </legend>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tdf-podium-row">
              <span className="tdf-podium-rank">{i + 1}e</span>
              <select
                aria-label={`Blanc position ${i + 1}`}
                value={white[i] ?? ""}
                onChange={(e) => updatePodium(white, setWhite, i, e.target.value)}
              >
                <option value="">— choisir —</option>
                {whitePool.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.team ? ` (${r.team})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>

        <fieldset className="tdf-jersey-group" disabled={locked}>
          <legend className="tdf-jersey-label">
            <span className="tdf-jersey-icon">🟢</span> Meilleur sprinter (maillot vert)
          </legend>
          <div className="tdf-podium-row">
            <select
              aria-label="Maillot vert"
              value={green ?? ""}
              onChange={(e) => setGreen(e.target.value || null)}
            >
              <option value="">— choisir —</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.team ? ` (${r.team})` : ""}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="tdf-jersey-group" disabled={locked}>
          <legend className="tdf-jersey-label">
            <span className="tdf-jersey-icon">🔴</span> Meilleur grimpeur (maillot à pois)
          </legend>
          <div className="tdf-podium-row">
            <select
              aria-label="Maillot à pois"
              value={polka ?? ""}
              onChange={(e) => setPolka(e.target.value || null)}
            >
              <option value="">— choisir —</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.team ? ` (${r.team})` : ""}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </div>

      {!locked && (
        <div className="tdf-submit-row">
          <button
            type="button"
            className="primary-button"
            disabled={!canSubmit || status === "saving"}
            onClick={submit}
          >
            {status === "saving" ? "Enregistrement…" : "Valider mes pronos généraux"}
          </button>
          {status === "saved" && (
            <p className="form-notice" role="status">
              Pronos enregistrés.
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
