import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { TimelineItemResolverByRepostId } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import type { IoriD1Db } from '../client.ts';
import { timelineItemsTable } from '../schema.ts';

export const createD1TimelineItemResolverByRepostId = (
  db: IoriD1Db,
): TimelineItemResolverByRepostId => ({
  resolve: async ({ repostId }) => {
    const [row] = await db.select().from(timelineItemsTable)
      .where(and(
        eq(timelineItemsTable.repostId, repostId),
        eq(timelineItemsTable.type, 'repost'),
        isNull(timelineItemsTable.deletedAt),
      ))
      .limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        timelineItemId: TimelineItemId.orThrow(row.timelineItemId),
        type: row.type as 'post' | 'repost',
        actorId: ActorId.orThrow(row.actorId),
        postId: PostId.orThrow(row.postId),
        repostId: row.repostId === null ? null : RepostId.orThrow(row.repostId),
        createdAt: row.createdAt.getTime(),
      },
    );
  },
});
