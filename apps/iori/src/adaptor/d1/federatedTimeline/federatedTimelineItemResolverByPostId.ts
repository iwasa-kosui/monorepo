import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FederatedTimelineItemResolverByPostId } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import type { IoriD1Db } from '../client.ts';
import { federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemResolverByPostId = (db: IoriD1Db): FederatedTimelineItemResolverByPostId => ({
  resolve: async ({ postId }) => {
    const [row] = await db.select().from(federatedTimelineItemsTable).where(
      eq(federatedTimelineItemsTable.postId, postId),
    ).limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
        postId,
        relayId: RelayId.orThrow(row.relayId),
        receivedAt: Instant.orThrow(row.receivedAt.getTime()),
      },
    );
  },
});
