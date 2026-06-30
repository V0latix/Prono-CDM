import { useMemo, useState } from "react";
import type { TdfRider } from "./api";

// Recherche par nom + filtres nationalite/equipe sur une liste de coureurs.
export function useRiderFilter(riders: TdfRider[]) {
  const [query, setQuery] = useState("");
  const [nationality, setNationality] = useState("");
  const [team, setTeam] = useState("");

  const nationalities = useMemo(
    () =>
      Array.from(
        new Set(riders.map((r) => r.nationality).filter(Boolean) as string[])
      ).sort(),
    [riders]
  );
  const teams = useMemo(
    () =>
      Array.from(new Set(riders.map((r) => r.team).filter(Boolean) as string[])).sort(),
    [riders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return riders.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (!nationality || r.nationality === nationality) &&
        (!team || r.team === team)
    );
  }, [riders, query, nationality, team]);

  return {
    filtered,
    nationalities,
    teams,
    query,
    setQuery,
    nationality,
    setNationality,
    team,
    setTeam
  };
}

export type RiderFilterState = ReturnType<typeof useRiderFilter>;

export function RiderFilterBar({ state }: { state: RiderFilterState }) {
  const {
    query,
    setQuery,
    nationality,
    setNationality,
    team,
    setTeam,
    nationalities,
    teams
  } = state;

  return (
    <div className="tdf-filter-bar">
      <input
        type="search"
        className="tdf-filter-search"
        placeholder="Rechercher un coureur…"
        aria-label="Rechercher un coureur"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        aria-label="Filtrer par nationalité"
        value={nationality}
        onChange={(e) => setNationality(e.target.value)}
      >
        <option value="">Toutes nationalités</option>
        {nationalities.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrer par équipe"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
      >
        <option value="">Toutes équipes</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
