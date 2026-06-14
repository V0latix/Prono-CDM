import { describe, expect, it } from "vitest";
import {
  topScorelinesByMatch,
  type ScorelineAggregateRow
} from "./league-predictions";

function row(
  match_id: string,
  home: number,
  away: number,
  count: number
): ScorelineAggregateRow {
  return { match_id, home, away, count };
}

describe("topScorelinesByMatch", () => {
  it("renvoie une map vide sans lignes", () => {
    expect(topScorelinesByMatch([]).size).toBe(0);
  });

  it("trie par fréquence décroissante et limite le nombre de scores", () => {
    const result = topScorelinesByMatch(
      [
        row("m1", 1, 0, 5),
        row("m1", 2, 0, 8),
        row("m1", 2, 1, 6),
        row("m1", 0, 0, 1)
      ],
      3
    );
    expect(result.get("m1")).toEqual([
      { home: 2, away: 0, count: 8 },
      { home: 2, away: 1, count: 6 },
      { home: 1, away: 0, count: 5 }
    ]);
  });

  it("départage les ex æquo de façon déterministe (home puis away croissant)", () => {
    const result = topScorelinesByMatch([
      row("m1", 2, 1, 4),
      row("m1", 1, 0, 4),
      row("m1", 1, 1, 4)
    ]);
    expect(result.get("m1")).toEqual([
      { home: 1, away: 0, count: 4 },
      { home: 1, away: 1, count: 4 },
      { home: 2, away: 1, count: 4 }
    ]);
  });

  it("sépare les scores par match", () => {
    const result = topScorelinesByMatch([
      row("m1", 1, 0, 2),
      row("m2", 0, 0, 3)
    ]);
    expect(result.get("m1")).toEqual([{ home: 1, away: 0, count: 2 }]);
    expect(result.get("m2")).toEqual([{ home: 0, away: 0, count: 3 }]);
  });

  it("respecte la limite quand il y a plus de scores que demandé", () => {
    const result = topScorelinesByMatch(
      [
        row("m1", 0, 0, 4),
        row("m1", 1, 0, 3),
        row("m1", 2, 0, 2),
        row("m1", 3, 0, 1)
      ],
      2
    );
    expect(result.get("m1")).toHaveLength(2);
    expect(result.get("m1")?.map((s) => s.count)).toEqual([4, 3]);
  });

  it("renvoie tous les scores triés quand la limite est négative", () => {
    const result = topScorelinesByMatch(
      [
        row("m1", 0, 0, 4),
        row("m1", 1, 0, 3),
        row("m1", 2, 0, 2),
        row("m1", 3, 0, 1)
      ],
      -1
    );
    expect(result.get("m1")).toHaveLength(4);
    expect(result.get("m1")?.map((s) => s.count)).toEqual([4, 3, 2, 1]);
  });
});
