import { describe, expect, it } from "vitest";
import {
  buildProgressionSeries,
  type ProgressionMember,
  type ProgressionPredictionRow
} from "./progression";

const members: ProgressionMember[] = [
  { id: "u1", pseudo: "Alice" },
  { id: "u2", pseudo: "Bob" }
];

function pred(
  user_id: string,
  match_id: string,
  points: number,
  kickoff_at: string,
  status = "FINISHED"
): ProgressionPredictionRow {
  return {
    user_id,
    match_id,
    points,
    status,
    kickoff_at,
    home_team: `${match_id}-home`,
    away_team: `${match_id}-away`
  };
}

describe("buildProgressionSeries", () => {
  it("renvoie une série vide sans membre ni prono", () => {
    const series = buildProgressionSeries([], [], "u1");
    expect(series.points).toEqual([]);
    expect(series.leaderUserId).toBeNull();
    expect(series.playerCount).toBe(0);
  });

  it("cumule les points dans l'ordre des coups d'envoi", () => {
    const rows = [
      pred("u1", "m2", 5, "2026-06-12T19:00:00Z"),
      pred("u1", "m1", 3, "2026-06-11T19:00:00Z")
    ];
    const series = buildProgressionSeries([members[0]], rows, "u1");
    expect(series.points.map((p) => p.matchId)).toEqual(["m1", "m2"]);
    expect(series.points.map((p) => p.me)).toEqual([3, 8]);
  });

  it("aligne moi = leader = moyenne pour un joueur seul", () => {
    const rows = [pred("u1", "m1", 4, "2026-06-11T19:00:00Z")];
    const series = buildProgressionSeries([members[0]], rows, "u1");
    expect(series.points[0]).toMatchObject({ me: 4, leader: 4, average: 4 });
    expect(series.leaderUserId).toBe("u1");
    expect(series.playerCount).toBe(1);
  });

  it("désigne le leader sur le total et calcule la moyenne sur les joueurs actifs", () => {
    const rows = [
      pred("u1", "m1", 3, "2026-06-11T19:00:00Z"),
      pred("u2", "m1", 5, "2026-06-11T19:00:00Z"),
      pred("u1", "m2", 0, "2026-06-12T19:00:00Z"),
      pred("u2", "m2", 4, "2026-06-12T19:00:00Z")
    ];
    // currentUser = u1 (3 puis 3), leader = u2 (5 puis 9), moyenne cumulée = (8/2 puis 12/2).
    const series = buildProgressionSeries(members, rows, "u1");
    expect(series.leaderUserId).toBe("u2");
    expect(series.playerCount).toBe(2);
    expect(series.points.map((p) => p.me)).toEqual([3, 3]);
    expect(series.points.map((p) => p.leader)).toEqual([5, 9]);
    expect(series.points.map((p) => p.average)).toEqual([4, 6]);
  });

  it("traite une absence de prono comme 0 point", () => {
    const rows = [
      pred("u1", "m1", 5, "2026-06-11T19:00:00Z"),
      // u2 n'a pas pronostiqué m1 ; il pronostique m2.
      pred("u1", "m2", 0, "2026-06-12T19:00:00Z"),
      pred("u2", "m2", 3, "2026-06-12T19:00:00Z")
    ];
    const series = buildProgressionSeries(members, rows, "u2");
    // u2 cumulé : 0 (absent sur m1) puis 3.
    expect(series.points.map((p) => p.me)).toEqual([0, 3]);
    // moyenne : m1 -> (5+0)/2 = 2.5 ; m2 cumulé -> (5+3)/2 = 4.
    expect(series.points.map((p) => p.average)).toEqual([2.5, 4]);
    expect(series.playerCount).toBe(2);
  });

  it("ignore les matchs non terminés", () => {
    const rows = [
      pred("u1", "m1", 5, "2026-06-11T19:00:00Z", "FINISHED"),
      pred("u1", "m2", 3, "2026-06-12T19:00:00Z", "IN_PLAY"),
      pred("u1", "m3", 2, "2026-06-13T19:00:00Z", "SCHEDULED")
    ];
    const series = buildProgressionSeries([members[0]], rows, "u1");
    expect(series.points).toHaveLength(1);
    expect(series.points[0].matchId).toBe("m1");
  });

  it("met la ligne 'moi' à 0 quand l'utilisateur n'est pas membre", () => {
    const rows = [pred("u1", "m1", 5, "2026-06-11T19:00:00Z")];
    const series = buildProgressionSeries([members[0]], rows, "ghost");
    expect(series.points[0].me).toBe(0);
    expect(series.points[0].leader).toBe(5);
  });

  it("départage le leader par pseudo quand les totaux sont égaux", () => {
    const rows = [
      pred("u1", "m1", 4, "2026-06-11T19:00:00Z"),
      pred("u2", "m1", 4, "2026-06-11T19:00:00Z")
    ];
    // Totaux égaux -> Alice (u1) avant Bob (u2).
    const series = buildProgressionSeries(members, rows, "u1");
    expect(series.leaderUserId).toBe("u1");
  });

  it("ignore les pronos de non-membres (sécurité de périmètre groupe)", () => {
    const rows = [
      pred("u1", "m1", 4, "2026-06-11T19:00:00Z"),
      pred("intrus", "m1", 99, "2026-06-11T19:00:00Z")
    ];
    const series = buildProgressionSeries([members[0]], rows, "u1");
    expect(series.points[0]).toMatchObject({ me: 4, leader: 4, average: 4 });
    expect(series.playerCount).toBe(1);
  });
});
