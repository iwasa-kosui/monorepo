import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import type { InterestSourceKind } from '../../../domain/interestSource/interestSource.ts';
import { InterestSourceId } from '../../../domain/interestSource/interestSourceId.ts';
import type {
  InterestVectorsResolverByUserId,
  StoredInterestVector,
} from '../../../domain/recommendation/recommendation.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';

const PAGE_SIZE = 300;

export const createD1InterestVectorsResolverByUserId = (db: IoriD1Db): InterestVectorsResolverByUserId => ({
  resolve: async (userId) => {
    const vectors: StoredInterestVector[] = [];
    let after: string | undefined;
    for (;;) {
      const rows = await db.select({
        interestSourceId: interestSourcesTable.interestSourceId,
        kind: interestSourcesTable.kind,
        ref: interestSourcesTable.ref,
        weight: interestSourcesTable.weight,
        occurredAt: interestSourcesTable.occurredAt,
        embedding: interestSourcesTable.embedding,
      }).from(interestSourcesTable)
        .where(and(
          eq(interestSourcesTable.userId, userId),
          isNull(interestSourcesTable.deletedAt),
          isNotNull(interestSourcesTable.embeddedAt),
          isNotNull(interestSourcesTable.embedding),
          after === undefined ? undefined : gt(interestSourcesTable.interestSourceId, after),
        ))
        .orderBy(asc(interestSourcesTable.interestSourceId))
        .limit(PAGE_SIZE);
      for (const row of rows) {
        if (row.embedding === null || !Embedding.validate(row.embedding).ok) continue;
        vectors.push({
          interestSourceId: InterestSourceId.orThrow(row.interestSourceId),
          kind: row.kind as InterestSourceKind,
          ref: row.ref,
          weight: row.weight,
          occurredAt: Instant.orThrow(row.occurredAt.getTime()),
          embedding: row.embedding,
        });
      }
      const last = rows.at(-1);
      if (rows.length < PAGE_SIZE || last === undefined) break;
      after = last.interestSourceId;
    }
    return RA.ok(vectors);
  },
});
