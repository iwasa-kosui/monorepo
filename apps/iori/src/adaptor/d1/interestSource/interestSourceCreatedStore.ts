import { RA } from '@iwasa-kosui/result';

import type { InterestSourceCreatedStore } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, interestSourcesTable } from '../schema.ts';

// D1 の束縛上限 100 に収まるよう、1 文あたり 12 列 × 8 行に分ける
const ROWS_PER_INSERT = 8;

export const createD1InterestSourceCreatedStore = (db: IoriD1Db): InterestSourceCreatedStore => ({
  store: async (...events) => {
    const rows = events.map(({ aggregateState: source }) => ({
      ...source,
      embedding: null,
      occurredAt: new Date(source.occurredAt),
      embeddedAt: null,
      deletedAt: null,
      createdAt: new Date(source.createdAt),
      updatedAt: new Date(source.updatedAt),
    }));
    const inserts = [];
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      inserts.push(db.insert(interestSourcesTable).values(rows.slice(i, i + ROWS_PER_INSERT)));
    }
    await runBatch(db, [
      ...inserts,
      ...events.map((event) => db.insert(domainEventsTable).values(toD1DomainEventRow(event))),
    ]);
    return RA.ok(undefined);
  },
});
