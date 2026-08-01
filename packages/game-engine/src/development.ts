import { createSeededRandom, shuffled } from "./random.ts";

export type DevelopmentCardType =
  | "knight"
  | "road-building"
  | "year-of-plenty"
  | "monopoly"
  | "victory-point";

export type DevelopmentCardId = `dev:${number}`;

export interface DevelopmentCardDefinition {
  readonly id: DevelopmentCardId;
  readonly type: DevelopmentCardType;
}

export interface OwnedDevelopmentCard extends DevelopmentCardDefinition {
  readonly purchasedPlayerTurn: number;
}

export interface ResolvedDevelopmentCard extends DevelopmentCardDefinition {
  readonly playerId: string;
  readonly playedPlayerTurn: number;
}

export const DEVELOPMENT_CARD_COUNTS: Readonly<Record<DevelopmentCardType, number>> = {
  knight: 20,
  "road-building": 3,
  "year-of-plenty": 3,
  monopoly: 3,
  "victory-point": 5,
};

export function createDevelopmentDeck(seed: string): readonly DevelopmentCardDefinition[] {
  const cards: DevelopmentCardDefinition[] = [];
  let sequence = 1;
  for (const [type, count] of Object.entries(DEVELOPMENT_CARD_COUNTS) as
    [DevelopmentCardType, number][]) {
    for (let index = 0; index < count; index += 1) {
      cards.push({ id: `dev:${sequence}`, type });
      sequence += 1;
    }
  }
  return shuffled(cards, createSeededRandom(`development:${seed}`));
}

export function isKnightOrProgressCard(type: DevelopmentCardType): boolean {
  return type !== "victory-point";
}
