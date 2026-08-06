import { longestRoadLength, playerScore } from "./scoring.ts";
import type { GameState } from "./gameState.ts";
import type { PlayerId } from "./types.ts";

export interface GameOverPlayerView {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly seat: number;
  readonly rank: number;
  readonly publicScore: number;
  readonly finalScore: number;
  readonly settlements: number;
  readonly cities: number;
  readonly playedKnights: number;
  readonly longestRoadLength: number;
  readonly victoryPointCards: number;
}

export interface GameOverView {
  readonly winnerId: PlayerId;
  readonly longestRoadHolderId: PlayerId | null;
  readonly largestArmyHolderId: PlayerId | null;
  readonly players: readonly GameOverPlayerView[];
}

export function createGameOverView(state: GameState): GameOverView {
  if (state.phase.kind !== "game-over") throw new Error("Game-over view requires a finished game");
  const winnerId = state.phase.winnerId;
  const rows = state.playerOrder.map((playerId) => {
    const player = state.players.get(playerId);
    if (!player) throw new Error(`Missing player ${playerId}`);
    const score = playerScore(state, playerId);
    let settlements = 0;
    let cities = 0;
    for (const building of state.occupancy.buildingsByVertex.values()) {
      if (building.playerId !== playerId) continue;
      if (building.kind === "city") cities += 1;
      else settlements += 1;
    }
    return {
      playerId,
      name: player.name,
      seat: player.seat,
      publicScore: score.publicScore,
      finalScore: score.authoritativeScore,
      settlements,
      cities,
      playedKnights: player.playedKnights,
      longestRoadLength: longestRoadLength(state.layout.topology, state.occupancy, playerId),
      victoryPointCards: score.revealedVictoryPoints + score.hiddenVictoryPoints,
    };
  });
  const sorted = [...rows].sort((left, right) => {
    if (left.playerId === winnerId) return -1;
    if (right.playerId === winnerId) return 1;
    return right.finalScore - left.finalScore || left.seat - right.seat;
  });
  const rankByPlayer = new Map<PlayerId, number>();
  let previousScore: number | null = null;
  let rank = 0;
  sorted.forEach((row, index) => {
    if (row.finalScore !== previousScore) rank = index + 1;
    rankByPlayer.set(row.playerId, rank);
    previousScore = row.finalScore;
  });
  return {
    winnerId,
    longestRoadHolderId: state.longestRoadHolderId,
    largestArmyHolderId: state.largestArmyHolderId,
    players: rows.map((row) => ({ ...row, rank: rankByPlayer.get(row.playerId) ?? 0 })),
  };
}
