import { RA } from "@iwasa-kosui/result";
import { DB } from "../db.ts";
import { singleton } from "../../../helper/singleton.ts";
import { domainEventsTable, postsTable } from "../schema.ts";
import type { PostDeleted, PostDeletedStore } from "../../../domain/post/post.ts";
import { eq } from "drizzle-orm";

const store = async (event: PostDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const { postId, deletedAt } = event.eventPayload;
    await tx.update(postsTable)
      .set({ deletedAt: new Date(deletedAt) })
      .where(eq(postsTable.postId, postId));
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

const getInstance = singleton((): PostDeletedStore => ({
  store,
}));

export const PgPostDeletedStore = {
  getInstance,
} as const;
