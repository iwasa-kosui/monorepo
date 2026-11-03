import { RA } from '@iwasa-kosui/result';
import { and, desc, lt } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { FederatedTimelineItemsResolver } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../../domain/post/post.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { buildPostsWithAuthor, selectPostRowsByIds } from '../post/postWithAuthorResolvers.ts';
import { federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemsResolver = (
  db: IoriD1Db,
  _origin: string,
): FederatedTimelineItemsResolver => ({
  resolve: async ({ receivedAt, mutedActorIds }) => {
    const rows = await db.select().from(federatedTimelineItemsTable)
      .where(and(
        receivedAt === undefined ? undefined : lt(federatedTimelineItemsTable.receivedAt, new Date(receivedAt)),
      ))
      .orderBy(desc(federatedTimelineItemsTable.receivedAt))
      .limit(20);
    const muted = new Set<ActorId>(mutedActorIds);
    const postRows = await selectPostRowsByIds(db, [...new Set(rows.map((row) => row.postId))]);
    const posts = new Map<string, PostWithAuthor>(
      (await buildPostsWithAuthor(db, postRows)).map((post) => [post.postId, post]),
    );
    const items = rows.flatMap((row) => {
      const post = posts.get(row.postId);
      if (post === undefined || muted.has(post.actorId)) return [];
      return [{
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
        post,
        relayId: RelayId.orThrow(row.relayId),
        receivedAt: Instant.orThrow(row.receivedAt.getTime()),
      }];
    });
    return RA.ok(items);
  },
});
