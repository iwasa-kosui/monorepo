import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';

import type { InterestSourcesResolverByUserIdAndRefAndKinds } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';
import { interestSourceSelection, reconstructInterestSource } from './interestSourceMapper.ts';

export const createD1InterestSourcesResolverByUserIdAndRefAndKinds = (
  db: IoriD1Db,
): InterestSourcesResolverByUserIdAndRefAndKinds => ({
  resolve: async ({ userId, ref, kinds }) => {
    if (kinds.length === 0) return RA.ok([]);
    const rows = await db.select(interestSourceSelection).from(interestSourcesTable)
      .where(and(
        eq(interestSourcesTable.userId, userId),
        eq(interestSourcesTable.ref, ref),
        inArray(interestSourcesTable.kind, [...kinds]),
      ));
    return RA.ok(rows.map(reconstructInterestSource));
  },
});
