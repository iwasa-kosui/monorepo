import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { FederatedTimelineItemsResolver } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { resolvePostsWithAuthorByIds } from '../post/postWithAuthorBatch.ts';
import { visibleToViewer } from '../post/visibleToViewer.ts';
import { federatedTimelineItemsTable, postsTable } from '../schema.ts';

const cursorItem = alias(federatedTimelineItemsTable, 'cursor_item');
const latestItem = alias(federatedTimelineItemsTable, 'latest_item');

const cursorOf = (postId: string) =>
  sql`select ${cursorItem.receivedAt}, ${cursorItem.federatedTimelineItemId} from ${federatedTimelineItemsTable} ${cursorItem}
    where ${cursorItem.postId} = ${postId}
    order by ${cursorItem.receivedAt} desc, ${cursorItem.federatedTimelineItemId} desc
    limit 1`;

export const createD1FederatedTimelineItemsResolver = (db: IoriD1Db): FederatedTimelineItemsResolver => ({
  resolve: async ({ page, mutedActorIds, currentActorId, onlyVisibleToViewer }) => {
    const columns = {
      createdAt: federatedTimelineItemsTable.receivedAt,
      id: federatedTimelineItemsTable.federatedTimelineItemId,
    };
    const rows = await db.select({
      federatedTimelineItemId: federatedTimelineItemsTable.federatedTimelineItemId,
      postId: federatedTimelineItemsTable.postId,
      relayId: federatedTimelineItemsTable.relayId,
      receivedAt: federatedTimelineItemsTable.receivedAt,
    })
      .from(federatedTimelineItemsTable)
      .innerJoin(postsTable, eq(federatedTimelineItemsTable.postId, postsTable.postId))
      .where(and(
        isNull(postsTable.deletedAt),
        visibleToViewer({ currentActorId, onlyVisibleToViewer }),
        mutedActorIds.length === 0
          ? undefined
          : notInArray(postsTable.actorId, sql`(select value from json_each(${idsJson(mutedActorIds)}))`),
        eq(
          federatedTimelineItemsTable.federatedTimelineItemId,
          sql`(select ${latestItem.federatedTimelineItemId} from ${federatedTimelineItemsTable} ${latestItem}
            where ${latestItem.postId} = ${federatedTimelineItemsTable.postId}
            order by ${latestItem.receivedAt} desc, ${latestItem.federatedTimelineItemId} desc
            limit 1)`,
        ),
        ...pageConditions(page, columns, cursorOf),
      ))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    const posts = await resolvePostsWithAuthorByIds(db, rows.map((row) => PostId.orThrow(row.postId)), currentActorId);
    return RA.ok(rows.flatMap((row) => {
      const post = posts.get(PostId.orThrow(row.postId));
      return post === undefined ? [] : [{
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
        post,
        relayId: RelayId.orThrow(row.relayId),
        receivedAt: Instant.orThrow(row.receivedAt.getTime()),
      }];
    }));
  },
});
