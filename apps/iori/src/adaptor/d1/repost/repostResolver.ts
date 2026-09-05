import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { RepostResolver } from '../../../domain/repost/repost.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { IoriD1Db } from '../client.ts';
import { repostsTable } from '../schema.ts';

export const createD1RepostResolver = (db: IoriD1Db): RepostResolver => ({
  resolve: async ({ actorId, postId }) => {
    const [row] = await db.select().from(repostsTable)
      .where(and(eq(repostsTable.actorId, actorId), eq(repostsTable.postId, postId)))
      .limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        repostId: RepostId.orThrow(row.repostId),
        actorId: row.actorId as ActorId,
        postId: PostId.orThrow(row.postId),
        announceActivityUri: row.announceActivityUri,
      },
    );
  },
});
