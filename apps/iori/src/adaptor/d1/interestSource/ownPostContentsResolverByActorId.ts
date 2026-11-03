import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { OwnPostContentsResolverByActorId } from '../../../domain/interestSource/interestMaterial.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { postsTable } from '../schema.ts';

export const createD1OwnPostContentsResolverByActorId = (db: IoriD1Db): OwnPostContentsResolverByActorId => ({
  resolve: async (actorId) => {
    const rows = await db.select({
      postId: postsTable.postId,
      content: postsTable.content,
      createdAt: postsTable.createdAt,
    }).from(postsTable)
      .where(and(eq(postsTable.actorId, actorId), eq(postsTable.type, 'local'), isNull(postsTable.deletedAt)));
    return RA.ok(rows.map((row) => ({
      postId: PostId.orThrow(row.postId),
      content: row.content,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
    })));
  },
});
