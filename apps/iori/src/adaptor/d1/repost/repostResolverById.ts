import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { RepostResolverById } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { IoriD1Db } from '../client.ts';
import { repostsTable } from '../schema.ts';

export const createD1RepostResolverById = (db: IoriD1Db): RepostResolverById => ({
  resolve: async (repostId) => {
    const [row] = await db.select().from(repostsTable).where(eq(repostsTable.repostId, repostId)).limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        repostId: RepostId.orThrow(row.repostId),
        actorId: row.actorId as ActorId,
        postId: PostId.orThrow(row.postId),
        announceActivityUri: row.announceActivityUri,
        createdAt: Instant.orThrow(row.createdAt.getTime()),
      },
    );
  },
});
