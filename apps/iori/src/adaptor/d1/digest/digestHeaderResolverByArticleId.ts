import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestHeaderResolverByArticleId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1DigestHeaderResolverByArticleId = (db: IoriD1Db): DigestHeaderResolverByArticleId => ({
  resolve: async (articleId) => {
    const [row] = await db.select().from(digestsTable)
      .where(eq(digestsTable.articleId, articleId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructDigestHeader(row));
  },
});
