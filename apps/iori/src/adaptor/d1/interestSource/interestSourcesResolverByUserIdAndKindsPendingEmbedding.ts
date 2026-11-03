import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type {
  InterestSourcesResolverByUserIdAndKindsPendingEmbedding,
} from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';
import { interestSourceSelection, reconstructInterestSource } from './interestSourceMapper.ts';

export const createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding = (
  db: IoriD1Db,
): InterestSourcesResolverByUserIdAndKindsPendingEmbedding => ({
  resolve: async ({ userId, kinds, limit }) => {
    if (kinds.length === 0) return RA.ok([]);
    const rows = await db.select(interestSourceSelection).from(interestSourcesTable)
      .where(and(
        eq(interestSourcesTable.userId, userId),
        inArray(interestSourcesTable.kind, [...kinds]),
        isNull(interestSourcesTable.embeddedAt),
        isNull(interestSourcesTable.deletedAt),
      ))
      .orderBy(asc(interestSourcesTable.createdAt), asc(interestSourcesTable.interestSourceId))
      .limit(limit);
    return RA.ok(rows.map(reconstructInterestSource));
  },
});
