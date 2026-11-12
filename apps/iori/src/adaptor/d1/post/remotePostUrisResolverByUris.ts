import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { RemotePostUrisResolverByUris } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { postsTable, remotePostsTable } from '../schema.ts';

export const createD1RemotePostUrisResolverByUris = (db: IoriD1Db): RemotePostUrisResolverByUris => ({
  resolve: async ({ uris }) => {
    if (uris.length === 0) return RA.ok([]);
    const rows = await db.select({ uri: remotePostsTable.uri }).from(remotePostsTable)
      .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(inArray(remotePostsTable.uri, [...uris]), isNull(postsTable.deletedAt)));
    return RA.ok(rows.map((row) => row.uri));
  },
});
