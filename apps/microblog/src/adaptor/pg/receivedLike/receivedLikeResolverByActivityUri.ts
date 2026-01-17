import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { ReceivedLike, ReceivedLikeResolverByActivityUri } from '../../../domain/receivedLike/receivedLike.ts';
import { ReceivedLikeId } from '../../../domain/receivedLike/receivedLikeId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { receivedLikesTable } from '../schema.ts';

const resolve = async ({ likeActivityUri }: { likeActivityUri: string }): RA<ReceivedLike | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(receivedLikesTable)
    .where(eq(receivedLikesTable.likeActivityUri, likeActivityUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    receivedLikeId: ReceivedLikeId.orThrow(row.receivedLikeId),
    likerActorId: ActorId.orThrow(row.likerActorId),
    likedPostId: PostId.orThrow(row.likedPostId),
    likeActivityUri: row.likeActivityUri,
  });
};

const getInstance = singleton(
  (): ReceivedLikeResolverByActivityUri => ({
    resolve,
  }),
);

export const PgReceivedLikeResolverByActivityUri = {
  getInstance,
} as const;
