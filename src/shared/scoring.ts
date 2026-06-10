export type StageKind = "GROUP" | "KNOCKOUT";
export type Winner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;

export type MatchForScoring = {
  stage: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: Winner;
};

export type PredictionForScoring = {
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedWinner: Winner;
};

export type ScoreBreakdown = {
  points: number;
  exactScore: boolean;
  correctResult: boolean;
  correctGoalDiff: boolean;
  stageKind: StageKind;
};

const KNOCKOUT_STAGE_HINTS = [
  "LAST_32",
  "ROUND_OF_32",
  "LAST_16",
  "ROUND_OF_16",
  "QUARTER",
  "SEMI",
  "THIRD_PLACE",
  "FINAL",
  "PLAY_OFF"
];

export function getStageKind(stage: string | null | undefined): StageKind {
  if (!stage) return "GROUP";
  const normalized = stage.toUpperCase();
  return KNOCKOUT_STAGE_HINTS.some((hint) => normalized.includes(hint))
    ? "KNOCKOUT"
    : "GROUP";
}

export function resultFromScore(
  homeScore: number,
  awayScore: number
): Exclude<Winner, null> {
  if (homeScore > awayScore) return "HOME_TEAM";
  if (awayScore > homeScore) return "AWAY_TEAM";
  return "DRAW";
}

export function normalizePredictionWinner(
  prediction: PredictionForScoring,
  stageKind: StageKind
): Winner {
  const scoreWinner = resultFromScore(
    prediction.predictedHomeScore,
    prediction.predictedAwayScore
  );

  if (stageKind === "KNOCKOUT" && scoreWinner === "DRAW") {
    return prediction.predictedWinner;
  }

  return scoreWinner;
}

export function scorePrediction(
  match: MatchForScoring,
  prediction: PredictionForScoring
): ScoreBreakdown {
  const stageKind = getStageKind(match.stage);

  if (match.homeScore === null || match.awayScore === null) {
    return {
      points: 0,
      exactScore: false,
      correctResult: false,
      correctGoalDiff: false,
      stageKind
    };
  }

  const actualWinner =
    stageKind === "KNOCKOUT" && match.winner
      ? match.winner
      : resultFromScore(match.homeScore, match.awayScore);
  const predictedWinner = normalizePredictionWinner(prediction, stageKind);
  const correctResult = predictedWinner === actualWinner;
  const exactScore =
    prediction.predictedHomeScore === match.homeScore &&
    prediction.predictedAwayScore === match.awayScore &&
    (stageKind === "GROUP" || !match.winner || predictedWinner === actualWinner);
  const actualDiff = match.homeScore - match.awayScore;
  const predictedDiff =
    prediction.predictedHomeScore - prediction.predictedAwayScore;
  const correctGoalDiff = correctResult && actualDiff === predictedDiff;

  if (!correctResult) {
    return {
      points: 0,
      exactScore,
      correctResult,
      correctGoalDiff: false,
      stageKind
    };
  }

  if (stageKind === "KNOCKOUT") {
    if (exactScore) {
      return { points: 10, exactScore, correctResult, correctGoalDiff, stageKind };
    }
    return {
      points: correctGoalDiff ? 8 : 6,
      exactScore,
      correctResult,
      correctGoalDiff,
      stageKind
    };
  }

  if (exactScore) {
    return { points: 5, exactScore, correctResult, correctGoalDiff, stageKind };
  }

  return {
    points: correctGoalDiff ? 4 : 3,
    exactScore,
    correctResult,
    correctGoalDiff,
    stageKind
  };
}
