import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { Repost, RepostResolver } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { repostsTable } from '../schema.ts';

const resolve = async (
  { actorId, postId }: { actorId: ActorId; postId: PostId },
): RA<Repost | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(repostsTable)
    .where(and(
      eq(repostsTable.actorId, actorId),
      eq(repostsTable.postId, postId),
    ))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    repostId: RepostId.orThrow(row.repostId),
    actorId: row.actorId as ActorId,
    postId: PostId.orThrow(row.postId),
    announceActivityUri: row.announceActivityUri,
  });
};

const getInstance = singleton(
  (): RepostResolver => ({
    resolve,
  }),
);

export const PgRepostResolver = {
  getInstance,
} as const;
