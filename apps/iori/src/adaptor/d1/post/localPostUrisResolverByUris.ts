import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { LocalPostUrisResolverByUris } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { localPostsTable, postsTable } from '../schema.ts';

export const createD1LocalPostUrisResolverByUris = (db: IoriD1Db, origin: string): LocalPostUrisResolverByUris => ({
  resolve: async ({ uris }) => {
    const localOrigin = new URL(origin).origin;
    const uriByPostId = new Map<string, string>();
    for (const uri of uris) {
      const parsed = URL.canParse(uri) ? new URL(uri) : undefined;
      const match = parsed?.origin === localOrigin ? parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/) : null;
      if (match) uriByPostId.set(match[1], uri);
    }
    if (uriByPostId.size === 0) return RA.ok([]);
    const rows = await db.select({ postId: localPostsTable.postId }).from(localPostsTable)
      .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
      .where(and(inArray(localPostsTable.postId, [...uriByPostId.keys()]), isNull(postsTable.deletedAt)));
    return RA.ok(rows.flatMap((row) => uriByPostId.get(row.postId) ?? []));
  },
});
