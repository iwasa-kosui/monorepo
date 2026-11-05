import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type {
  InterestSourceResolverByUserIdAndInterestSourceId,
} from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { interestSourcesTable } from '../schema.ts';
import { interestSourceSelection, reconstructInterestSource } from './interestSourceMapper.ts';

export const createD1InterestSourceResolverByUserIdAndInterestSourceId = (
  db: IoriD1Db,
): InterestSourceResolverByUserIdAndInterestSourceId => ({
  resolve: async ({ userId, interestSourceId }) => {
    const [row] = await db.select(interestSourceSelection).from(interestSourcesTable)
      .where(and(eq(interestSourcesTable.userId, userId), eq(interestSourcesTable.interestSourceId, interestSourceId)))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructInterestSource(row));
  },
});
