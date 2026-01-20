import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { Repost, RepostsResolverByPostId } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { repostsTable } from '../schema.ts';

const resolve = async ({ postId }: { postId: PostId }): RA<Repost[], never> => {
  const result = await DB.getInstance()
    .select()
    .from(repostsTable)
    .where(eq(repostsTable.postId, postId));

  return RA.ok(
    result.map((row) => ({
      repostId: RepostId.orThrow(row.repostId),
      actorId: ActorId.orThrow(row.actorId),
      postId: PostId.orThrow(row.postId),
      announceActivityUri: row.announceActivityUri,
    })),
  );
};

const getInstance = singleton(
  (): RepostsResolverByPostId => ({
    resolve,
  }),
);

export const PgRepostsResolverByPostId = {
  getInstance,
} as const;
