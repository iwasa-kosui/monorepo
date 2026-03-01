import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { TimelineItem, TimelineItemsResolverByPostId } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { timelineItemsTable } from '../schema.ts';

const resolve = async ({ postId }: { postId: PostId }): RA<TimelineItem[], never> => {
  const result = await DB.getInstance()
    .select()
    .from(timelineItemsTable)
    .where(and(
      eq(timelineItemsTable.postId, postId),
      isNull(timelineItemsTable.deletedAt),
    ));

  return RA.ok(
    result.map((row) => ({
      timelineItemId: TimelineItemId.orThrow(row.timelineItemId),
      type: row.type as 'post' | 'repost',
      actorId: ActorId.orThrow(row.actorId),
      postId: PostId.orThrow(row.postId),
      repostId: row.repostId ? RepostId.orThrow(row.repostId) : null,
      createdAt: row.createdAt.getTime(),
    })),
  );
};

const getInstance = singleton(
  (): TimelineItemsResolverByPostId => ({
    resolve,
  }),
);

export const PgTimelineItemsResolverByPostId = {
  getInstance,
} as const;
