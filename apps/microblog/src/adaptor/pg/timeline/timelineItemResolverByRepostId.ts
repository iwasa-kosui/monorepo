import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { TimelineItem, TimelineItemResolverByRepostId } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { timelineItemsTable } from '../schema.ts';

const resolve = async ({ repostId }: { repostId: RepostId }): RA<TimelineItem | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(timelineItemsTable)
    .where(and(
      eq(timelineItemsTable.repostId, repostId),
      eq(timelineItemsTable.type, 'repost'),
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
  (): TimelineItemResolverByRepostId => ({
    resolve,
  }),
);

export const PgTimelineItemResolverByRepostId = {
  getInstance,
} as const;
