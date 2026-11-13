import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { SessionEndedStore } from '../../../domain/session/session.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, sessionsTable } from '../schema.ts';

export const createD1SessionEndedStore = (db: IoriD1Db): SessionEndedStore => ({
  store: async (...events) => {
    await runBatch(db, [
      ...(events.length === 0 ? [] : [
        db.delete(sessionsTable).where(inArray(sessionsTable.sessionId, events.map((event) => event.aggregateId))),
      ]),
      ...events.map((event) => db.insert(domainEventsTable).values(toD1DomainEventRow(event))),
    ]);
    return RA.ok(undefined);
  },
});
