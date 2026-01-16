import { RA } from '@iwasa-kosui/result';

import type { Agg } from '../../../domain/aggregate/index.ts';
import type { KeyGenerated } from '../../../domain/key/generate.ts';
import { DB } from '../db.ts';
import { domainEventsTable, keysTable } from '../schema.ts';

const store = async (event: KeyGenerated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx
      .insert(keysTable)
      .values({
        keyId: event.aggregateId,
        type: event.aggregateState.type,
        userId: event.aggregateState.userId,
        privateKey: event.aggregateState.privateKey,
        publicKey: event.aggregateState.publicKey,
      })
      .execute();
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

const getInstance = (): Agg.Store<KeyGenerated> => ({
  store,
});

export const PgKeyGeneratedStore = {
  getInstance,
} as const;
