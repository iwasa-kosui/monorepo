import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type {
  InterestSourcesResolverByUserIdAndKindIncludingDeleted,
} from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';
import { interestSourceSelection, reconstructInterestSource } from './interestSourceMapper.ts';

export const createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted = (
  db: IoriD1Db,
): InterestSourcesResolverByUserIdAndKindIncludingDeleted => ({
  resolve: async ({ userId, kind }) => {
    const rows = await db.select(interestSourceSelection).from(interestSourcesTable)
      .where(and(eq(interestSourcesTable.userId, userId), eq(interestSourcesTable.kind, kind)));
    return RA.ok(rows.map(reconstructInterestSource));
  },
});
