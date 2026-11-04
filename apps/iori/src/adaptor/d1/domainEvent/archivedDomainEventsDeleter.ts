import { RA } from '@iwasa-kosui/result';
import { and, lt, notInArray, sql } from 'drizzle-orm';

import {
  ARCHIVE_RETAINED_EVENT_NAMES,
  type ArchivedDomainEventsDeleter,
} from '../../../domain/domainEvent/domainEventArchive.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable } from '../schema.ts';

export const createD1ArchivedDomainEventsDeleter = (db: IoriD1Db): ArchivedDomainEventsDeleter => ({
  deleteRange: async ({ first, last, cutoff }) => {
    const { occurredAt, eventId } = domainEventsTable;
    const result = await db.delete(domainEventsTable)
      .where(and(
        sql`(${occurredAt}, ${eventId}) >= (${first.occurredAt}, ${first.eventId})`,
        sql`(${occurredAt}, ${eventId}) <= (${last.occurredAt}, ${last.eventId})`,
        lt(occurredAt, new Date(cutoff)),
        notInArray(domainEventsTable.eventName, [...ARCHIVE_RETAINED_EVENT_NAMES]),
      ))
      .run();
    return RA.ok(result.meta.changes);
  },
});
