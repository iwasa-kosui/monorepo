import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  FederatedTimelineItem,
  FederatedTimelineItemsResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { federatedTimelineItemsTable } from '../schema.ts';

const resolve = async (
  { postId }: { postId: PostId },
): RA<FederatedTimelineItem[], never> => {
  const result = await DB.getInstance()
    .select()
    .from(federatedTimelineItemsTable)
    .where(eq(federatedTimelineItemsTable.postId, postId));

  return RA.ok(
    result.map((row) => ({
      federatedTimelineItemId: FederatedTimelineItemId.orThrow(row.federatedTimelineItemId),
      postId: row.postId as PostId,
      relayId: RelayId.orThrow(row.relayId),
      receivedAt: Instant.orThrow(row.receivedAt.getTime()),
    })),
  );
};

const getInstance = singleton(
  (): FederatedTimelineItemsResolverByPostId => ({
    resolve,
  }),
);

export const PgFederatedTimelineItemsResolverByPostId = {
  getInstance,
} as const;
