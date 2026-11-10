import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import {
  ARCHIVE_RETAINED_EVENT_NAMES,
  type ArchivedDomainEventsDeleter,
} from '../../../domain/domainEvent/domainEventArchive.ts';
import type { IoriD1Db } from '../client.ts';

export const createD1ArchivedDomainEventsDeleter = (db: IoriD1Db): ArchivedDomainEventsDeleter => ({
  deleteRange: async ({ first, last, cutoff, count }) => {
    const retained = sql.join(ARCHIVE_RETAINED_EVENT_NAMES.map((name) => sql`${name}`), sql`, `);
    const inRange = sql`(occurredAt, eventId) >= (${first.occurredAt}, ${first.eventId})
      AND (occurredAt, eventId) <= (${last.occurredAt}, ${last.eventId})
      AND occurredAt < ${cutoff}
      AND eventName NOT IN (${retained})`;
    const result = await db.run(sql`
      DELETE FROM domain_events
      WHERE ${inRange}
        AND (SELECT COUNT(*) FROM domain_events WHERE ${inRange}) = ${count}
    `);
    return RA.ok(result.meta.changes);
  },
});
