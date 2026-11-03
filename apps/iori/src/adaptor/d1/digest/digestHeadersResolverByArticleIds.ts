import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { DigestHeadersResolverByArticleIds } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1DigestHeadersResolverByArticleIds = (db: IoriD1Db): DigestHeadersResolverByArticleIds => ({
  resolve: async (articleIds) => {
    if (articleIds.length === 0) return RA.ok([]);
    const rows = await db.select().from(digestsTable)
      .where(inArray(digestsTable.articleId, sql`(select value from json_each(${idsJson(articleIds)}))`));
    return RA.ok(rows.map(reconstructDigestHeader));
  },
});
