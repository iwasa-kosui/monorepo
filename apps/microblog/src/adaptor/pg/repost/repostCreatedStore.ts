import { RA } from '@iwasa-kosui/result';

import type { RepostCreated, RepostCreatedStore } from '../../../domain/repost/repost.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, repostsTable } from '../schema.ts';

const store = async (event: RepostCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(repostsTable).values({
      repostId: event.aggregateState.repostId,
      actorId: event.aggregateState.actorId,
      postId: event.aggregateState.postId,
      announceActivityUri: event.aggregateState.announceActivityUri,
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
  (): RepostCreatedStore => ({
    store,
  }),
);

export const PgRepostCreatedStore = {
  getInstance,
} as const;
