import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Like, type LikesResolverByPostId } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable } from '../schema.ts';

const getInstance = singleton((): LikesResolverByPostId => ({
  resolve: async ({ postId }: { postId: PostId }) => {
    const rows = await DB.getInstance()
      .select()
      .from(likesTable)
      .where(eq(likesTable.postId, postId))
      .execute();
    return RA.ok(
      rows.map((row) =>
        Like.orThrow({
          likeId: LikeId.orThrow(row.likeId),
          actorId: row.actorId,
          postId: row.postId,
        })
      ),
    );
  },
}));

export const PgLikesResolverByPostId = {
  getInstance,
} as const;
