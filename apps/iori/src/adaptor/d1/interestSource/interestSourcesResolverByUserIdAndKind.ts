import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { InterestSourcesResolverByUserIdAndKind } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';
import { interestSourceSelection, reconstructInterestSource } from './interestSourceMapper.ts';

export const createD1InterestSourcesResolverByUserIdAndKind = (
  db: IoriD1Db,
): InterestSourcesResolverByUserIdAndKind => ({
  resolve: async ({ userId, kind }) => {
    const rows = await db.select(interestSourceSelection).from(interestSourcesTable)
      .where(and(
        eq(interestSourcesTable.userId, userId),
        eq(interestSourcesTable.kind, kind),
        isNull(interestSourcesTable.deletedAt),
      ));
    return RA.ok(rows.map(reconstructInterestSource));
  },
});
