import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { TimelineItem, TimelineItemResolverByPostId } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { timelineItemsTable } from '../schema.ts';

const resolve = async ({ postId }: { postId: PostId }): RA<TimelineItem | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(timelineItemsTable)
    .where(and(
      eq(timelineItemsTable.postId, postId),
      eq(timelineItemsTable.type, 'post'),
      isNull(timelineItemsTable.deletedAt),
    ))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    timelineItemId: TimelineItemId.orThrow(row.timelineItemId),
    type: row.type as 'post' | 'repost',
    actorId: ActorId.orThrow(row.actorId),
    postId: PostId.orThrow(row.postId),
    repostId: row.repostId ? RepostId.orThrow(row.repostId) : null,
    createdAt: row.createdAt.getTime(),
  });
};

const getInstance = singleton(
  (): TimelineItemResolverByPostId => ({
    resolve,
  }),
);

export const PgTimelineItemResolverByPostId = {
  getInstance,
} as const;
