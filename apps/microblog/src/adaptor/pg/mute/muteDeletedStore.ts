import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { MuteDeleted, MuteDeletedStore } from '../../../domain/mute/mute.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, mutesTable } from '../schema.ts';

const store = async (...events: readonly MuteDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.delete(mutesTable).where(
        eq(mutesTable.muteId, event.eventPayload.muteId),
      );
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

const getInstance = singleton((): MuteDeletedStore => ({
  store,
}));

export const PgMuteDeletedStore = {
  getInstance,
} as const;
