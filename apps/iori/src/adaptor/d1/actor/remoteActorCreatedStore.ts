import { RA } from '@iwasa-kosui/result';

import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, domainEventsTable, remoteActorsTable } from '../schema.ts';

export const createD1RemoteActorCreatedStore = (db: IoriD1Db): RemoteActorCreatedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.insert(actorsTable).values({
            actorId: event.aggregateId,
            uri: event.aggregateState.uri,
            inboxUrl: event.aggregateState.inboxUrl,
            type: event.aggregateState.type,
            logoUri: event.aggregateState.logoUri,
          }),
          db.insert(remoteActorsTable).values({
            actorId: event.aggregateId,
            url: event.aggregateState.url,
            username: event.aggregateState.username,
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
