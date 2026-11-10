import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FederatedTimelineItemsResolverByPostId } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemsResolverByPostId = (
  db: IoriD1Db,
): FederatedTimelineItemsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok(
      (await db.select().from(federatedTimelineItemsTable).where(
        eq(federatedTimelineItemsTable.postId, postId),
      )).map((row) => ({
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
        postId: PostId.orThrow(row.postId),
        relayId: RelayId.orThrow(row.relayId),
        receivedAt: Instant.orThrow(row.receivedAt.getTime()),
      })),
    ),
});
