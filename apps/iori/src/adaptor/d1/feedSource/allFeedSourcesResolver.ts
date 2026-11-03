import { RA } from '@iwasa-kosui/result';

import type { AllFeedSourcesResolver } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { feedSourcesTable } from '../schema.ts';
import { reconstructFeedSource } from './feedSourceMapper.ts';

export const createD1AllFeedSourcesResolver = (db: IoriD1Db): AllFeedSourcesResolver => ({
  resolve: async () => RA.ok((await db.select().from(feedSourcesTable)).map(reconstructFeedSource)),
});
