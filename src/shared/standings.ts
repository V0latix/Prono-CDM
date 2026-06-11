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

// La CDM 2026 compte 12 poules de 4 equipes ; chaque equipe joue 3 matchs de poule.
export const WORLD_CUP_GROUP_COUNT = 12;

// La phase de poules est terminee quand les 12 poules existent et que toutes les
// equipes y ont joue leurs 3 matchs. Tant que ce n'est pas le cas, le classement
// des meilleurs 3es n'est que provisoire (une poule encore en cours peut produire
// un meilleur 3e qui depasse ceux affiches). Sert a nuancer l'UI en consequence.
export function isGroupStageComplete(
  standings: readonly GroupStanding[],
  groupCount = WORLD_CUP_GROUP_COUNT
): boolean {
  return (
    standings.length >= groupCount &&
    standings.every(
      (standing) =>
        standing.rows.length >= 4 && standing.rows.every((row) => row.played >= 3)
    )
  );
}

export type BestThirds = {
  // 3es garantis dans les `count` premiers quels que soient les departages non modelises.
  qualified: Set<string>;
  // 3es a egalite parfaite (sur les criteres suivis) qui chevauchent la ligne de
  // qualification : on ne peut pas trancher equitablement entre eux ici.
  contested: Set<string>;
};

// Vrai si `a` devance strictement `b` sur les seuls criteres que l'on suit
// (points, diff, buts marques). Le nom d'equipe n'est PAS un departage : a
// criteres egaux, deux equipes sont a egalite, pas l'une devant l'autre.
function strictlyBetterThird(a: GroupStandingRow, b: GroupStandingRow): boolean {
  if (a.points !== b.points) return a.points > b.points;
  if (a.goalDiff !== b.goalDiff) return a.goalDiff > b.goalDiff;
  return a.goalsFor > b.goalsFor;
}

function tiedThird(a: GroupStandingRow, b: GroupStandingRow): boolean {
  return a.points === b.points && a.goalDiff === b.goalDiff && a.goalsFor === b.goalsFor;
}

// Les 8 meilleurs 3es de la CDM 2026 se qualifient pour les 16es de finale. On
// compare les 3es de chaque poule entre eux. Calcul "live" : une poule sans 3e
// (moins de 3 equipes classees) est ignoree.
//
// Pour ne jamais affirmer une qualification arbitraire, on n'utilise PAS le nom
// comme departage final (contrairement au tri intra-poule) :
//   - un 3e est `qualified` s'il tient une place meme dans le pire des cas,
//     c.-a-d. si (3es strictement devant) + (3es a egalite avec lui, lui inclus)
//     ne depasse pas `count` ;
//   - s'il est dans le `count` potentiel mais qu'une egalite chevauche la ligne
//     de qualification, il est `contested` (a departager par des criteres
//     officiels non modelises : discipline, tirage au sort).
export function computeBestThirds(
  standings: readonly GroupStanding[],
  count = 8
): BestThirds {
  const thirds = standings
    .map((standing) => standing.rows[2])
    .filter((row): row is GroupStandingRow => Boolean(row));

  const qualified = new Set<string>();
  const contested = new Set<string>();

  for (const third of thirds) {
    const strictlyBetter = thirds.filter((other) => strictlyBetterThird(other, third)).length;
    if (strictlyBetter >= count) continue; // assez de 3es devant => elimine
    const tiedWithSelf = thirds.filter((other) => tiedThird(other, third)).length; // inclut `third`
    if (strictlyBetter + tiedWithSelf <= count) {
      qualified.add(third.team); // garanti meme si toutes les egalites jouent contre lui
    } else {
      contested.add(third.team); // l'egalite chevauche la 8e place
    }
  }

  return { qualified, contested };
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
