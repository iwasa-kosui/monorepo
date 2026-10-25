import { RA } from '@iwasa-kosui/result';
import { and, desc, lt } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { FederatedTimelineItemsResolver } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
import { federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemsResolver = (
  db: IoriD1Db,
  origin: string,
): FederatedTimelineItemsResolver => ({
  resolve: async ({ receivedAt, mutedActorIds }) => {
    const rows = await db.select().from(federatedTimelineItemsTable)
      .where(and(
        receivedAt === undefined ? undefined : lt(federatedTimelineItemsTable.receivedAt, new Date(receivedAt)),
      ))
      .orderBy(desc(federatedTimelineItemsTable.receivedAt))
      .limit(20);
    const muted = new Set<ActorId>(mutedActorIds);
    const threadResolver = createD1ThreadResolver(db, origin);
    const items = await Promise.all(rows.map(async (row) => {
      const post = await threadResolver.resolve({ postId: row.postId as never });
      if (!post.ok || post.val.currentPost === null || muted.has(post.val.currentPost.actorId)) return undefined;
      return {
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
        post: post.val.currentPost,
        relayId: RelayId.orThrow(row.relayId),
        receivedAt: Instant.orThrow(row.receivedAt.getTime()),
      };
    }));
    return RA.ok(items.filter((item) => item !== undefined));
  },
});
