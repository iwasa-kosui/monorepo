import { RA } from "@iwasa-kosui/result";
import type { Unfollowed, UnfollowedStore } from "../../../domain/follow/follow.ts";
import { DB } from "../db.ts";
import { domainEventsTable, followsTable } from "../schema.ts";
import { singleton } from "../../../helper/singleton.ts";
import { and, eq } from "drizzle-orm";

const store = async (event: Unfollowed): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(followsTable).where(and(
      eq(followsTable.followerId, event.eventPayload.followerId),
      eq(followsTable.followingId, event.eventPayload.followingId),
    ));
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

const getInstance = singleton((): UnfollowedStore => ({
  store,
}));

export const PgUnfollowedStore = {
  getInstance,
} as const;
