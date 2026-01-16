import z from "zod/v4";

import { Schema } from "../../helper/schema.ts";
import { ActorId } from "../actor/actorId.ts";
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import type { Agg } from "../aggregate/index.ts";
import type { Instant } from "../instant/instant.ts";
import { LikeId } from "./likeId.ts";

const zodType = z
  .object({
    likeId: LikeId.zodType,
    actorId: ActorId.zodType,
    objectUri: z.string(),
  })
  .describe("Like");
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Like = z.output<typeof zodType>;
export type LikeAggregateId = Readonly<{
  likeId: LikeId;
}>;
export type LikeAggregate = Agg.Aggregate<LikeAggregateId, "like", Like>;
const toAggregateId = (like: Like): LikeAggregateId => ({
  likeId: like.likeId,
});

type LikeEvent<
  TAggregateState extends Agg.InferState<LikeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<LikeAggregate, TAggregateState, TEventName, TEventPayload>;
const LikeEvent = AggregateEvent.createFactory<LikeAggregate>("like");

export type LikeCreated = LikeEvent<Like, "like.likeCreated", Like>;

const createLike = (payload: Like, now: Instant): LikeCreated => {
  return LikeEvent.create(
    toAggregateId(payload),
    payload,
    "like.likeCreated",
    payload,
    now,
  );
};

export type LikeCreatedStore = Agg.Store<LikeCreated>;
export type LikeResolver = Agg.Resolver<
  { actorId: ActorId; objectUri: string },
  Like | undefined
>;
export const Like = {
  ...schema,
  createLike,
  toAggregateId,
} as const;

export type AlreadyLikedError = Readonly<{
  type: "AlreadyLikedError";
  message: string;
  detail: {
    actorId: ActorId;
    objectUri: string;
  };
}>;

export const AlreadyLikedError = {
  create: ({
    actorId,
    objectUri,
  }: { actorId: ActorId; objectUri: string }): AlreadyLikedError => ({
    type: "AlreadyLikedError",
    message: `The actor with ID "${actorId}" has already liked the object "${objectUri}".`,
    detail: { actorId, objectUri },
  }),
} as const;
