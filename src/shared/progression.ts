// Construction pure des séries de points cumulés affichées dans le Classement :
// trois courbes (moi, le leader, la moyenne de la ligue) le long des matchs
// terminés, ordonnés par coup d'envoi. Isolé ici pour être testable hors Worker.

export type ProgressionMember = {
  id: string;
  pseudo: string;
};

export type ProgressionPredictionRow = {
  user_id: string;
  match_id: string;
  points: number;
  status: string;
  kickoff_at: string;
  home_team: string;
  away_team: string;
};

export type ProgressionPoint = {
  matchId: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  // Valeurs CUMULÉES (pas le gain du match seul).
  me: number;
  leader: number;
  average: number;
};

export type ProgressionSeries = {
  leaderUserId: string | null;
  leaderPseudo: string | null;
  // Nombre de joueurs ayant au moins un prono sur un match terminé : c'est la base
  // de la moyenne de la ligue (on n'inclut pas les membres totalement inactifs).
  playerCount: number;
  points: ProgressionPoint[];
};

const FINISHED_STATUSES = new Set(["FINISHED", "AWARDED"]);

export function buildProgressionSeries(
  members: ProgressionMember[],
  rows: ProgressionPredictionRow[],
  currentUserId: string
): ProgressionSeries {
  const memberIds = new Set(members.map((member) => member.id));
  // On ne garde que les pronos de membres sur des matchs terminés.
  const finishedRows = rows.filter(
    (row) => FINISHED_STATUSES.has(row.status) && memberIds.has(row.user_id)
  );

  // Axe X : matchs terminés ordonnés par coup d'envoi puis id (tri stable).
  const matchInfo = new Map<
    string,
    { kickoffAt: string; homeTeam: string; awayTeam: string }
  >();
  for (const row of finishedRows) {
    if (!matchInfo.has(row.match_id)) {
      matchInfo.set(row.match_id, {
        kickoffAt: row.kickoff_at,
        homeTeam: row.home_team,
        awayTeam: row.away_team
      });
    }
  }
  const orderedMatches = [...matchInfo.entries()].sort(
    ([aId, a], [bId, b]) =>
      Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt) || aId.localeCompare(bId)
  );

  // points[userId][matchId] = points marqués sur ce match (0 par défaut).
  const pointsByUserMatch = new Map<string, Map<string, number>>();
  const totalByUser = new Map<string, number>();
  for (const member of members) {
    pointsByUserMatch.set(member.id, new Map());
    totalByUser.set(member.id, 0);
  }
  const activePlayers = new Set<string>();
  for (const row of finishedRows) {
    const userMatches = pointsByUserMatch.get(row.user_id);
    if (!userMatches) continue;
    // Un seul prono par (user, match) en théorie ; on additionne par sûreté.
    userMatches.set(row.match_id, (userMatches.get(row.match_id) ?? 0) + row.points);
    totalByUser.set(row.user_id, (totalByUser.get(row.user_id) ?? 0) + row.points);
    activePlayers.add(row.user_id);
  }

  // Leader = total de points le plus élevé (tie-break : pseudo, fr).
  let leader: ProgressionMember | null = null;
  let leaderTotal = -Infinity;
  for (const member of members) {
    const total = totalByUser.get(member.id) ?? 0;
    if (
      !leader ||
      total > leaderTotal ||
      (total === leaderTotal && member.pseudo.localeCompare(leader.pseudo, "fr") < 0)
    ) {
      leader = member;
      leaderTotal = total;
    }
  }

  const playerCount = activePlayers.size;
  let meCumul = 0;
  let leaderCumul = 0;
  let sumCumul = 0; // somme cumulée des points de tous les joueurs
  const points: ProgressionPoint[] = [];

  for (const [matchId, info] of orderedMatches) {
    meCumul += pointsByUserMatch.get(currentUserId)?.get(matchId) ?? 0;
    leaderCumul += leader ? pointsByUserMatch.get(leader.id)?.get(matchId) ?? 0 : 0;
    let matchSum = 0;
    for (const member of members) {
      matchSum += pointsByUserMatch.get(member.id)?.get(matchId) ?? 0;
    }
    sumCumul += matchSum;
    points.push({
      matchId,
      kickoffAt: info.kickoffAt,
      homeTeam: info.homeTeam,
      awayTeam: info.awayTeam,
      me: meCumul,
      leader: leaderCumul,
      average: playerCount ? sumCumul / playerCount : 0
    });
  }

  return {
    leaderUserId: leader?.id ?? null,
    leaderPseudo: leader?.pseudo ?? null,
    playerCount,
    points
  };
}
