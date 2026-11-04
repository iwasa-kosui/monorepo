import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RemoteActorProfileUpdatedStore } from '../../../domain/actor/updateProfile.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, remoteActorsTable } from '../schema.ts';
import { toRemoteActorProfileColumns } from './remoteActorProfileColumns.ts';

export const createD1RemoteActorProfileUpdatedStore = (db: IoriD1Db): RemoteActorProfileUpdatedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.update(remoteActorsTable).set(toRemoteActorProfileColumns(event.eventPayload.profile)).where(
            eq(remoteActorsTable.actorId, event.aggregateId),
          ),
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
