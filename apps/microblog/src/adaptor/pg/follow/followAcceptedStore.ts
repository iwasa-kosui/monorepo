import { RA } from "@iwasa-kosui/result";

import type { FollowAccepted, FollowAcceptedStore } from "../../../domain/follow/follow.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { domainEventsTable, followsTable } from "../schema.ts";

const store = async (event: FollowAccepted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(followsTable).values({
      followerId: event.aggregateState.followerId,
      followingId: event.aggregateState.followingId,
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
}

const getInstance = singleton((): FollowAcceptedStore => ({
  store,
}));

export const PgFollowedStore = {
  getInstance,
} as const;
