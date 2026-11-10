import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyRepostDeletedStore } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable } from '../schema.ts';

export const createD1BlueskyRepostDeletedStore = (db: IoriD1Db): BlueskyRepostDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyRepostsTable).where(eq(blueskyRepostsTable.subjectUri, subjectUri));
    return RA.ok(undefined);
  },
});
