import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { RemoteLike, RemoteLikeResolverByActivityUri } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable, remoteLikesTable } from '../schema.ts';

const resolve = async ({ likeActivityUri }: { likeActivityUri: string }): RA<RemoteLike | undefined, never> => {
  const result = await DB.getInstance()
    .select({
      likes: likesTable,
      remote_likes: remoteLikesTable,
    })
    .from(remoteLikesTable)
    .innerJoin(likesTable, eq(remoteLikesTable.likeId, likesTable.likeId))
    .where(eq(remoteLikesTable.likeActivityUri, likeActivityUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    type: 'remote',
    likeId: LikeId.orThrow(row.likes.likeId),
    actorId: ActorId.orThrow(row.likes.actorId),
    postId: PostId.orThrow(row.likes.postId),
    likeActivityUri: row.remote_likes.likeActivityUri,
  });
};

const getInstance = singleton(
  (): RemoteLikeResolverByActivityUri => ({
    resolve,
  }),
);

export const PgRemoteLikeResolverByActivityUri = {
  getInstance,
} as const;
