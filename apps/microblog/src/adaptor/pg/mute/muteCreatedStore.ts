import { RA } from '@iwasa-kosui/result';

import type { MuteCreated, MuteCreatedStore } from '../../../domain/mute/mute.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, mutesTable } from '../schema.ts';

const store = async (event: MuteCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(mutesTable).values({
      muteId: event.aggregateState.muteId,
      userId: event.aggregateState.userId,
      mutedActorId: event.aggregateState.mutedActorId,
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
  (): MuteCreatedStore => ({
    store,
  }),
);

export const PgMuteCreatedStore = {
  getInstance,
} as const;
