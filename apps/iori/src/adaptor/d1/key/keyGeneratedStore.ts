import { RA } from '@iwasa-kosui/result';

import type { KeyGeneratedStore } from '../../../domain/key/generate.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, keysTable } from '../schema.ts';

export const createD1KeyGeneratedStore = (db: IoriD1Db): KeyGeneratedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.insert(keysTable).values({
            keyId: event.aggregateId,
            type: event.aggregateState.type,
            userId: event.aggregateState.userId,
            privateKey: event.aggregateState.privateKey,
            publicKey: event.aggregateState.publicKey,
          }),
          db.insert(domainEventsTable).values({
            eventId: event.eventId,
            aggregateId: event.aggregateId,
            aggregateName: event.aggregateName,
            aggregateState: JSON.stringify(event.aggregateState),
            eventName: event.eventName,
            eventPayload: JSON.stringify(event.eventPayload),
            occurredAt: new Date(event.occurredAt),
          }),
        ]);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
