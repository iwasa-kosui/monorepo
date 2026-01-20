import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable } from '../schema.ts';

export type LikesResolverByActorId = {
  resolve: (actorId: ActorId) => RA<ReadonlySet<PostId>, never>;
};

const getInstance = singleton((): LikesResolverByActorId => ({
  resolve: async (actorId: ActorId) => {
    const rows = await DB.getInstance()
      .select({ postId: likesTable.postId })
      .from(likesTable)
      .where(eq(likesTable.actorId, actorId))
      .execute();
    return RA.ok(new Set(rows.map((row) => row.postId as PostId)));
  },
}));

export const PgLikesResolverByActorId = {
  getInstance,
} as const;
