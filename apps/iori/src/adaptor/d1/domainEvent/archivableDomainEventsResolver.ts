import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import {
  type ArchivableDomainEventsResolver,
  ARCHIVE_RETAINED_EVENT_NAMES,
  type ArchivedDomainEvent,
} from '../../../domain/domainEvent/domainEventArchive.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';

type Row = Readonly<Omit<ArchivedDomainEvent, 'occurredAt'> & { occurredAt: number }>;

export const createD1ArchivableDomainEventsResolver = (db: IoriD1Db): ArchivableDomainEventsResolver => ({
  resolve: async ({ cutoff, limit, byteBudget }) => {
    const retained = sql.join(ARCHIVE_RETAINED_EVENT_NAMES.map((name) => sql`${name}`), sql`, `);
    const rows = await db.all<Row>(sql`
      SELECT eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt
      FROM (
        SELECT eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt, rowBytes,
          SUM(rowBytes) OVER (ORDER BY occurredAt, eventId) AS cumulativeBytes
        FROM (
          SELECT eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt,
            COALESCE(length(CAST(aggregateState AS BLOB)), 0) + COALESCE(length(CAST(eventPayload AS BLOB)), 0) + length(CAST(aggregateId AS BLOB)) AS rowBytes
          FROM domain_events
          WHERE occurredAt < ${cutoff} AND eventName NOT IN (${retained})
          ORDER BY occurredAt, eventId
          LIMIT ${limit}
        )
      )
      WHERE cumulativeBytes - rowBytes < ${byteBudget}
      ORDER BY occurredAt, eventId
    `);
    return RA.ok(rows.map((row) => ({ ...row, occurredAt: Instant.orThrow(row.occurredAt) })));
  },
});
