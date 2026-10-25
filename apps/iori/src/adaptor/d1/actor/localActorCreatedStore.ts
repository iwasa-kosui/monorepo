import { RA } from '@iwasa-kosui/result';

import type { LocalActorCreatedStore } from '../../../domain/actor/createLocalActor.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, domainEventsTable, localActorsTable } from '../schema.ts';

export const createD1LocalActorCreatedStore = (db: IoriD1Db): LocalActorCreatedStore => ({
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
          db.insert(localActorsTable).values({ actorId: event.aggregateId, userId: event.aggregateState.userId }),
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
