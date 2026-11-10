import { RA } from '@iwasa-kosui/result';

import type { UserPasswordSet, UserPasswordSetStore } from '../../../domain/password/userPassword.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, userPasswordsTable } from '../schema.ts';

export const createD1UserPasswordSetStore = (db: IoriD1Db): UserPasswordSetStore => ({
  store: (event: UserPasswordSet) =>
    RA.flow(
      fromD1(async () => {
        const { hashedPassword, userId } = event.aggregateState;
        await db.batch([
          db.insert(userPasswordsTable).values({
            userId,
            algorithm: hashedPassword.algorithm,
            parallelism: hashedPassword.parallelism,
            tagLength: hashedPassword.tagLength,
            memory: hashedPassword.memory,
            passes: hashedPassword.passes,
            nonceHex: hashedPassword.nonceHex,
            tagHex: hashedPassword.tagHex,
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
