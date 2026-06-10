// Classement des poules de la Coupe du monde, calcule a partir des matchs
// termines.
//
// On agrege uniquement les matchs de phase de poules (`group` non nul) qui sont
// termines avec un score numerique. La phase finale (`group` nul) et les matchs
// non joues sont ignores. Le calcul est volontairement pur et sans UI pour
// rester testable et partageable, comme `scoring.ts`.

export type StandingsMatch = {
  group: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type GroupStandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export type GroupStanding = {
  group: string;
  rows: GroupStandingRow[];
};

const FINISHED_STATUSES = new Set(["FINISHED", "AWARDED"]);

function isCountedMatch(match: StandingsMatch): boolean {
  return (
    match.group !== null &&
    FINISHED_STATUSES.has(match.status) &&
    typeof match.homeScore === "number" &&
    typeof match.awayScore === "number"
  );
}

function emptyRow(team: string): GroupStandingRow {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  };
}

function applyResult(row: GroupStandingRow, scored: number, conceded: number): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won += 1;
    row.points += 3;
  } else if (scored === conceded) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

// Tri d'une poule : points, puis difference de buts, puis buts marques, puis
// nom d'equipe (ordre deterministe et stable a defaut de tie-break officiel).
function compareRows(a: GroupStandingRow, b: GroupStandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.team.localeCompare(b.team);
}

export function computeGroupStandings(matches: readonly StandingsMatch[]): GroupStanding[] {
  const byGroup = new Map<string, Map<string, GroupStandingRow>>();

  for (const match of matches) {
    if (!isCountedMatch(match)) continue;
    const group = match.group as string;
    const homeScore = match.homeScore as number;
    const awayScore = match.awayScore as number;

    let teams = byGroup.get(group);
    if (!teams) {
      teams = new Map();
      byGroup.set(group, teams);
    }
    const home = teams.get(match.homeTeam) ?? emptyRow(match.homeTeam);
    const away = teams.get(match.awayTeam) ?? emptyRow(match.awayTeam);
    applyResult(home, homeScore, awayScore);
    applyResult(away, awayScore, homeScore);
    teams.set(match.homeTeam, home);
    teams.set(match.awayTeam, away);
  }

  return Array.from(byGroup.entries())
    .map(([group, teams]) => ({
      group,
      rows: Array.from(teams.values()).sort(compareRows)
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
