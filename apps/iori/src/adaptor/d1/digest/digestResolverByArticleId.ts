import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestResolverByArticleId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';
import { reconstructDigest } from './digestMapper.ts';

export const createD1DigestResolverByArticleId = (db: IoriD1Db): DigestResolverByArticleId => ({
  resolve: async (articleId) => {
    const [row] = await db.select().from(digestsTable)
      .where(eq(digestsTable.articleId, articleId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : await reconstructDigest(db, reconstructDigestHeader(row)));
  },
});
