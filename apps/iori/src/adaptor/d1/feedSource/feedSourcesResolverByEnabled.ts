import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourcesResolverByEnabled } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { feedSourcesTable } from '../schema.ts';
import { reconstructFeedSource } from './feedSourceMapper.ts';

export const createD1FeedSourcesResolverByEnabled = (db: IoriD1Db): FeedSourcesResolverByEnabled => ({
  resolve: async ({ enabled }) =>
    RA.ok((await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.enabled, enabled))).map(
      reconstructFeedSource,
    )),
});
