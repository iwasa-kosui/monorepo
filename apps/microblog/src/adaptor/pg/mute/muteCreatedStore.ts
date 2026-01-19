import { RA } from '@iwasa-kosui/result';

import { Instant } from '../../../domain/instant/instant.ts';
import type { MuteCreated, MuteCreatedStore } from '../../../domain/mute/mute.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, mutesTable } from '../schema.ts';

const store = async (...events: readonly MuteCreated[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.insert(mutesTable).values({
        muteId: event.aggregateState.muteId,
        muterId: event.aggregateState.muterId,
        mutedActorId: event.aggregateState.mutedActorId,
        createdAt: Instant.toDate(event.occurredAt),
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
    }
  });
  return RA.ok(undefined);
};

const getInstance = singleton((): MuteCreatedStore => ({
  store,
}));

export const PgMuteCreatedStore = {
  getInstance,
} as const;
