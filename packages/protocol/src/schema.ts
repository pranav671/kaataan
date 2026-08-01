import { z } from "zod";

export const playerColorSchema = z.enum(["teal", "coral", "gold", "blue", "plum", "umber"]);
export const resourceTypeSchema = z.enum(["brick", "lumber", "wool", "grain", "ore"]);
export const resourceBundleSchema = z.object({
  brick: z.number().int().min(0).max(24),
  lumber: z.number().int().min(0).max(24),
  wool: z.number().int().min(0).max(24),
  grain: z.number().int().min(0).max(24),
  ore: z.number().int().min(0).max(24),
}).strict();

const vertexIdSchema = z.string().regex(/^v:-?\d+:-?\d+$/);
const edgeIdSchema = z.string().regex(/^e:v:-?\d+:-?\d+\|v:-?\d+:-?\d+$/);
const hexIdSchema = z.string().regex(/^h:-?\d+:-?\d+$/);
const developmentCardIdSchema = z.string().regex(/^dev:\d+$/);

export const gameCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLACE_INITIAL_SETTLEMENT"), vertexId: vertexIdSchema }).strict(),
  z.object({ type: z.literal("PLACE_INITIAL_ROAD"), edgeId: edgeIdSchema }).strict(),
  z.object({ type: z.literal("ROLL_DICE") }).strict(),
  z.object({ type: z.literal("SUBMIT_DISCARD"), resources: resourceBundleSchema }).strict(),
  z.object({ type: z.literal("MOVE_ROBBER"), hexId: hexIdSchema }).strict(),
  z.object({ type: z.literal("STEAL_FROM_PLAYER"), targetPlayerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("BUILD_ROAD"), edgeId: edgeIdSchema }).strict(),
  z.object({ type: z.literal("BUILD_SETTLEMENT"), vertexId: vertexIdSchema }).strict(),
  z.object({ type: z.literal("BUILD_CITY"), vertexId: vertexIdSchema }).strict(),
  z.object({ type: z.literal("BUY_DEVELOPMENT_CARD") }).strict(),
  z.object({ type: z.literal("PLAY_DEVELOPMENT_CARD"), cardId: developmentCardIdSchema }).strict(),
  z.object({ type: z.literal("PLACE_FREE_ROAD"), edgeId: edgeIdSchema }).strict(),
  z.object({ type: z.literal("TAKE_YEAR_OF_PLENTY"), resources: resourceBundleSchema }).strict(),
  z.object({ type: z.literal("CHOOSE_MONOPOLY_RESOURCE"), resource: resourceTypeSchema }).strict(),
  z.object({ type: z.literal("REVEAL_VICTORY_POINTS"), cardIds: z.array(developmentCardIdSchema).min(1) }).strict(),
  z.object({
    type: z.literal("MARITIME_TRADE"),
    give: resourceTypeSchema,
    receive: resourceTypeSchema,
    units: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    type: z.literal("DOMESTIC_TRADE"),
    partnerId: z.string().min(1),
    actorGives: resourceBundleSchema,
    partnerGives: resourceBundleSchema,
  }).strict(),
  z.object({ type: z.literal("END_SUBTURN") }).strict(),
]);

const requestIdSchema = z.string().min(1).max(100);
const profileSchema = z.object({
  name: z.string().trim().min(2).max(24),
  color: playerColorSchema,
}).strict();

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room.create"), requestId: requestIdSchema, profile: profileSchema }).strict(),
  z.object({ type: z.literal("room.join"), requestId: requestIdSchema, code: z.string().trim().min(4).max(12), profile: profileSchema }).strict(),
  z.object({ type: z.literal("session.resume"), requestId: requestIdSchema, roomCode: z.string().min(4).max(12), playerId: z.string().min(1), reconnectToken: z.string().min(16) }).strict(),
  z.object({ type: z.literal("room.update_profile"), requestId: requestIdSchema, profile: profileSchema }).strict(),
  z.object({ type: z.literal("room.set_ready"), requestId: requestIdSchema, ready: z.boolean() }).strict(),
  z.object({ type: z.literal("room.start"), requestId: requestIdSchema }).strict(),
  z.object({ type: z.literal("room.leave"), requestId: requestIdSchema }).strict(),
  z.object({ type: z.literal("room.kick"), requestId: requestIdSchema, playerId: z.string().min(1) }).strict(),
  z.object({
    type: z.literal("trade.offer"),
    requestId: requestIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    partnerId: z.string().min(1),
    actorGives: resourceBundleSchema,
    partnerGives: resourceBundleSchema,
  }).strict(),
  z.object({
    type: z.literal("trade.counter"),
    requestId: requestIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    offerId: z.string().min(1),
    actorGives: resourceBundleSchema,
    partnerGives: resourceBundleSchema,
  }).strict(),
  z.object({ type: z.literal("trade.accept"), requestId: requestIdSchema, offerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("trade.reject"), requestId: requestIdSchema, offerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("trade.cancel"), requestId: requestIdSchema, offerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("game.command"), commandId: requestIdSchema, expectedVersion: z.number().int().nonnegative(), command: gameCommandSchema }).strict(),
  z.object({ type: z.literal("ping"), timestamp: z.number() }).strict(),
]);

export type PlayerColor = z.infer<typeof playerColorSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export function parseClientMessage(input: unknown): ClientMessage {
  return clientMessageSchema.parse(input);
}
