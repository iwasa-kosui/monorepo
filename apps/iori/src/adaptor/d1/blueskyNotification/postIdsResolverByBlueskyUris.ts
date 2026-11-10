import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { PostIdsResolverByBlueskyUris } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyCrosspostsTable } from '../schema.ts';

export const createD1PostIdsResolverByBlueskyUris = (db: IoriD1Db): PostIdsResolverByBlueskyUris => ({
  resolve: async (uris) => {
    if (uris.length === 0) return RA.ok(new Map());
    const rows = await db.select({ uri: blueskyCrosspostsTable.uri, postId: blueskyCrosspostsTable.postId })
      .from(blueskyCrosspostsTable)
      .where(and(
        eq(blueskyCrosspostsTable.status, 'sent'),
        inArray(blueskyCrosspostsTable.uri, sql`(select value from json_each(${idsJson(uris)}))`),
      ));
    const postIds = new Map<string, PostId>();
    for (const { uri, postId } of rows) {
      if (uri !== null && !postIds.has(uri)) postIds.set(uri, postId as PostId);
    }
    return RA.ok(postIds);
  },
});
