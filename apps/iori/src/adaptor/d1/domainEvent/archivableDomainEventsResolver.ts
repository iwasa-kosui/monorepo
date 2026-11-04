import { RA } from '@iwasa-kosui/result';
import { and, asc, lt, notInArray } from 'drizzle-orm';

import {
  type ArchivableDomainEventsResolver,
  ARCHIVE_RETAINED_EVENT_NAMES,
} from '../../../domain/domainEvent/domainEventArchive.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable } from '../schema.ts';

export const createD1ArchivableDomainEventsResolver = (db: IoriD1Db): ArchivableDomainEventsResolver => ({
  resolve: async ({ cutoff, limit }) => {
    const rows = await db.select().from(domainEventsTable)
      .where(and(
        lt(domainEventsTable.occurredAt, new Date(cutoff)),
        notInArray(domainEventsTable.eventName, [...ARCHIVE_RETAINED_EVENT_NAMES]),
      ))
      .orderBy(asc(domainEventsTable.occurredAt), asc(domainEventsTable.eventId))
      .limit(limit);
    return RA.ok(rows.map((row) => ({ ...row, occurredAt: Instant.orThrow(row.occurredAt.getTime()) })));
  },
});
