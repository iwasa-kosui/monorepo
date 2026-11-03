import { RA } from '@iwasa-kosui/result';
import { and, desc, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { TimelineSearchCandidatesResolver } from '../../../domain/timelineSearch/timelineSearchCandidatesResolver.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { postsTable } from '../schema.ts';

export const createD1TimelineSearchCandidatesResolver = (
  db: IoriD1Db,
): TimelineSearchCandidatesResolver => ({
  resolve: async ({ actorIds, terms, limit }) => {
    if (terms.length === 0) {
      return RA.ok([]);
    }

    const rows = await db.select({
      postId: postsTable.postId,
      content: postsTable.content,
      createdAt: postsTable.createdAt,
    })
      .from(postsTable)
      .where(and(
        isNull(postsTable.deletedAt),
        inArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson(actorIds)}))`),
        or(...terms.map((term) => like(postsTable.content, `%${term}%`))),
      ))
      .orderBy(desc(postsTable.createdAt))
      .limit(limit);

    return RA.ok(rows.map((row) => ({
      postId: PostId.orThrow(row.postId),
      content: row.content,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
    })));
  },
});
