import { RA } from '@iwasa-kosui/result';

import type { SessionStarted, SessionStartedStore } from '../../../domain/session/session.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, sessionsTable } from '../schema.ts';

export const createD1SessionStartedStore = (db: IoriD1Db): SessionStartedStore => ({
  store: (event: SessionStarted) =>
    RA.flow(
      fromD1(async () => {
        const { sessionId, userId, expires } = event.aggregateState;
        await db.batch([
          db.insert(sessionsTable).values({
            sessionId,
            userId,
            expires: new Date(expires),
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
