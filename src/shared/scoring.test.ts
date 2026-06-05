import { describe, expect, it } from "vitest";
import { scorePrediction } from "./scoring";

describe("scorePrediction", () => {
  it("awards 5 points for an exact group-stage score", () => {
    expect(
      scorePrediction(
        { stage: "GROUP_STAGE", homeScore: 2, awayScore: 1, winner: null },
        { predictedHomeScore: 2, predictedAwayScore: 1, predictedWinner: null }
      )
    ).toMatchObject({ points: 5, exactScore: true, correctResult: true });
  });

  it("awards 4 points for group-stage result with goal-difference bonus", () => {
    expect(
      scorePrediction(
        { stage: "GROUP_STAGE", homeScore: 3, awayScore: 1, winner: null },
        { predictedHomeScore: 2, predictedAwayScore: 0, predictedWinner: null }
      )
    ).toMatchObject({ points: 4, correctResult: true, correctGoalDiff: true });
  });

  it("awards 3 points for group-stage result only", () => {
    expect(
      scorePrediction(
        { stage: "GROUP_STAGE", homeScore: 1, awayScore: 0, winner: null },
        { predictedHomeScore: 3, predictedAwayScore: 1, predictedWinner: null }
      )
    ).toMatchObject({ points: 3, correctResult: true, correctGoalDiff: false });
  });

  it("awards no points for the wrong result", () => {
    expect(
      scorePrediction(
        { stage: "GROUP_STAGE", homeScore: 0, awayScore: 1, winner: null },
        { predictedHomeScore: 2, predictedAwayScore: 0, predictedWinner: null }
      )
    ).toMatchObject({ points: 0, correctResult: false });
  });

  it("doubles knockout exact scores", () => {
    expect(
      scorePrediction(
        { stage: "QUARTER_FINALS", homeScore: 2, awayScore: 1, winner: "HOME_TEAM" },
        { predictedHomeScore: 2, predictedAwayScore: 1, predictedWinner: null }
      )
    ).toMatchObject({ points: 10, exactScore: true });
  });

  it("uses the qualified team for knockout result when API winner is available", () => {
    expect(
      scorePrediction(
        { stage: "FINAL", homeScore: 1, awayScore: 1, winner: "AWAY_TEAM" },
        {
          predictedHomeScore: 1,
          predictedAwayScore: 1,
          predictedWinner: "AWAY_TEAM"
        }
      )
    ).toMatchObject({
      points: 10,
      exactScore: true,
      correctResult: true,
      correctGoalDiff: true
    });
  });

  it("rejects a tied knockout score when the predicted qualifier is wrong", () => {
    expect(
      scorePrediction(
        { stage: "FINAL", homeScore: 1, awayScore: 1, winner: "AWAY_TEAM" },
        {
          predictedHomeScore: 1,
          predictedAwayScore: 1,
          predictedWinner: "HOME_TEAM"
        }
      )
    ).toMatchObject({ points: 0, exactScore: false, correctResult: false });
  });

  it("awards 8 points for knockout result with goal-difference bonus", () => {
    expect(
      scorePrediction(
        { stage: "SEMI_FINALS", homeScore: 3, awayScore: 1, winner: "HOME_TEAM" },
        { predictedHomeScore: 2, predictedAwayScore: 0, predictedWinner: null }
      )
    ).toMatchObject({ points: 8, correctResult: true, correctGoalDiff: true });
  });

  it("keeps unplayed matches at zero without marking the prediction as successful", () => {
    expect(
      scorePrediction(
        { stage: "GROUP_STAGE", homeScore: null, awayScore: null, winner: null },
        { predictedHomeScore: 2, predictedAwayScore: 1, predictedWinner: null }
      )
    ).toEqual({
      points: 0,
      exactScore: false,
      correctResult: false,
      correctGoalDiff: false,
      stageKind: "GROUP"
    });
  });

  it("falls back to the available final score for knockout matches when the API winner is missing", () => {
    expect(
      scorePrediction(
        { stage: "FINAL", homeScore: 2, awayScore: 0, winner: null },
        { predictedHomeScore: 1, predictedAwayScore: 0, predictedWinner: null }
      )
    ).toMatchObject({
      points: 6,
      exactScore: false,
      correctResult: true,
      correctGoalDiff: false,
      stageKind: "KNOCKOUT"
    });
  });
});
