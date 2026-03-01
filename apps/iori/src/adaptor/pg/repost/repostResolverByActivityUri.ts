import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { Repost, RepostResolverByActivityUri } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { repostsTable } from '../schema.ts';

const resolve = async ({ announceActivityUri }: { announceActivityUri: string }): RA<Repost | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(repostsTable)
    .where(eq(repostsTable.announceActivityUri, announceActivityUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    repostId: RepostId.orThrow(row.repostId),
    actorId: ActorId.orThrow(row.actorId),
    postId: PostId.orThrow(row.postId),
    announceActivityUri: row.announceActivityUri,
  });
};

const getInstance = singleton(
  (): RepostResolverByActivityUri => ({
    resolve,
  }),
);

export const PgRepostResolverByActivityUri = {
  getInstance,
} as const;
