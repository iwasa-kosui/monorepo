import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourceResolverByUrl } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { feedSourcesTable } from '../schema.ts';
import { reconstructFeedSource } from './feedSourceMapper.ts';

export const createD1FeedSourceResolverByUrl = (db: IoriD1Db): FeedSourceResolverByUrl => ({
  resolve: async ({ url }) => {
    const [row] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, url));
    return RA.ok(row === undefined ? undefined : reconstructFeedSource(row));
  },
});
