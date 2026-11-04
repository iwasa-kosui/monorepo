import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { InterestSourceEmbeddingCopiedStore } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, interestSourcesTable } from '../schema.ts';

export const createD1InterestSourceEmbeddingCopiedStore = (db: IoriD1Db): InterestSourceEmbeddingCopiedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { embedding, ...payload } = event.eventPayload;
        const { aggregateState: source } = event;
        return [
          db.insert(interestSourcesTable).values({
            ...source,
            embedding,
            occurredAt: new Date(source.occurredAt),
            embeddedAt: new Date(payload.embeddedAt),
            deletedAt: null,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt),
          }).onConflictDoNothing(),
          db.update(interestSourcesTable)
            .set({
              contentHash: source.contentHash,
              weight: source.weight,
              occurredAt: new Date(source.occurredAt),
              embedding,
              embeddedAt: new Date(payload.embeddedAt),
              deletedAt: null,
              updatedAt: new Date(source.updatedAt),
            })
            .where(and(
              eq(interestSourcesTable.userId, source.userId),
              eq(interestSourcesTable.kind, source.kind),
              eq(interestSourcesTable.ref, source.ref),
            )),
          db.insert(domainEventsTable).values(toD1DomainEventRow({ ...event, eventPayload: payload })),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
