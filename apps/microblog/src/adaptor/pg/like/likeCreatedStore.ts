import { RA } from "@iwasa-kosui/result";
import type {
  LikeCreated,
  LikeCreatedStore,
} from "../../../domain/like/like.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { domainEventsTable, likesTable } from "../schema.ts";

const store = async (event: LikeCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(likesTable).values({
      likeId: event.aggregateState.likeId,
      actorId: event.aggregateState.actorId,
      objectUri: event.aggregateState.objectUri,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): LikeCreatedStore => ({
    store,
  }),
);

export const PgLikeCreatedStore = {
  getInstance,
} as const;
