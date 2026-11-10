import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestItemFeedbackGivenStore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestItemsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestItemFeedbackGivenStore = (db: IoriD1Db): DigestItemFeedbackGivenStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(digestItemsTable)
          .set({
            feedback: event.eventPayload.feedback,
            feedbackAt: event.eventPayload.feedbackAt === null ? null : new Date(event.eventPayload.feedbackAt),
          })
          .where(eq(digestItemsTable.digestItemId, event.eventPayload.digestItemId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
