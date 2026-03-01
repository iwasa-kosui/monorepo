import { RA } from '@iwasa-kosui/result';

import type { UserCreated, UserCreatedStore } from '../../../domain/user/createUser.ts';
import { DB } from '../db.ts';
import { domainEventsTable, usersTable } from '../schema.ts';

const store = async (event: UserCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(usersTable).values({
      userId: event.aggregateState.id,
      username: event.aggregateState.username,
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

const getInstance = (): UserCreatedStore => ({
  store,
});

export const PgUserCreatedStore = {
  getInstance,
} as const;
