import { RA } from '@iwasa-kosui/result';

import type { UserCreated, UserCreatedStore } from '../../../domain/user/createUser.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, usersTable } from '../schema.ts';

export const createD1UserCreatedStore = (db: IoriD1Db): UserCreatedStore => ({
  store: (event: UserCreated) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.insert(usersTable).values({
            userId: event.aggregateState.id,
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
