import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { TimelineItemsResolverByPostId } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import type { IoriD1Db } from '../client.ts';
import { timelineItemsTable } from '../schema.ts';

export const createD1TimelineItemsResolverByPostId = (db: IoriD1Db): TimelineItemsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok(
      (await db.select().from(timelineItemsTable).where(
        and(eq(timelineItemsTable.postId, postId), isNull(timelineItemsTable.deletedAt)),
      )).map((row) => ({
        timelineItemId: TimelineItemId.orThrow(row.timelineItemId),
        type: row.type as 'post' | 'repost',
        actorId: ActorId.orThrow(row.actorId),
        postId: PostId.orThrow(row.postId),
        repostId: row.repostId === null ? null : RepostId.orThrow(row.repostId),
        createdAt: Instant.orThrow(row.createdAt.getTime()),
      })),
    ),
});
