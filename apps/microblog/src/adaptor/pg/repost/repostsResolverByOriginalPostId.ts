import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { Repost, RepostsResolverByOriginalPostId } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { repostsTable } from '../schema.ts';

const resolve = async ({ originalPostId }: { originalPostId: PostId }): RA<Repost[], never> => {
  const result = await DB.getInstance()
    .select()
    .from(repostsTable)
    .where(eq(repostsTable.originalPostId, originalPostId));

  return RA.ok(
    result.map((row) => ({
      repostId: RepostId.orThrow(row.repostId),
      actorId: ActorId.orThrow(row.actorId),
      objectUri: row.objectUri,
      originalPostId: row.originalPostId ? PostId.orThrow(row.originalPostId) : null,
      announceActivityUri: row.announceActivityUri,
    })),
  );
};

const getInstance = singleton(
  (): RepostsResolverByOriginalPostId => ({
    resolve,
  }),
);

export const PgRepostsResolverByOriginalPostId = {
  getInstance,
} as const;
