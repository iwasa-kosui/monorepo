import { RA } from '@iwasa-kosui/result';
import { and, desc, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { PostId } from '../../../domain/post/postId.ts';
import {
  HOME_POSTS_BY_PERIOD_LIMIT,
  type HomePostsResolverByPeriod,
} from '../../../domain/timeline/homePostsResolverByPeriod.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { visibleToViewer } from '../post/visibleToViewer.ts';
import { postsTable } from '../schema.ts';

export const createD1HomePostsResolverByPeriod = (db: IoriD1Db): HomePostsResolverByPeriod => ({
  resolve: async ({ actorIds, currentActorId, since, until }) => {
    if (actorIds.length === 0) {
      return RA.ok([]);
    }

    const rows = await db.select({ postId: postsTable.postId })
      .from(postsTable)
      .where(and(
        isNull(postsTable.deletedAt),
        visibleToViewer({ currentActorId, onlyVisibleToViewer: true }),
        inArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson(actorIds)}))`),
        gte(postsTable.createdAt, new Date(since)),
        lt(postsTable.createdAt, new Date(until)),
      ))
      .orderBy(desc(postsTable.createdAt), desc(postsTable.postId))
      .limit(HOME_POSTS_BY_PERIOD_LIMIT);

    return RA.ok(rows.map((row) => PostId.orThrow(row.postId)));
  },
});
