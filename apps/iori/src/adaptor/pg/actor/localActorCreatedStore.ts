import { RA } from '@iwasa-kosui/result';

import type { LocalActorCreated, LocalActorCreatedStore } from '../../../domain/actor/createLocalActor.ts';
import { DB } from '../db.ts';
import { actorsTable, domainEventsTable, localActorsTable } from '../schema.ts';

const store = async (event: LocalActorCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(actorsTable).values({
      actorId: event.aggregateId,
      uri: event.aggregateState.uri,
      inboxUrl: event.aggregateState.inboxUrl,
      type: event.aggregateState.type,
      logoUri: event.aggregateState.logoUri,
    });
    await tx.insert(localActorsTable).values({
      actorId: event.aggregateId,
      userId: event.aggregateState.userId,
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

const getInstance = (): LocalActorCreatedStore => ({
  store,
});

export const PgLocalActorCreatedStore = {
  getInstance,
} as const;
