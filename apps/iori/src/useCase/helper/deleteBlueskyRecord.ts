import { Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostDeletedStore,
  type BlueskyCrosspostSavedStore,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyTimelineItemsDeletedStore } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClientForUser } from '../../ports/blueskyClient.ts';

type Deps = Readonly<{
  clientFor: BlueskyClientForUser;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  timelineItemsDeletedStore: BlueskyTimelineItemsDeletedStore;
  now: () => Instant;
}>;

export const deleteBlueskyRecordWith =
  ({ clientFor, crosspostSavedStore, crosspostDeletedStore, timelineItemsDeletedStore, now }: Deps) =>
  async (
    crosspost: BlueskyCrosspost,
  ): Promise<'deleted' | 'failed'> => {
    if (crosspost.rkey === null) {
      Result.unsafeUnwrap(await crosspostDeletedStore.delete(crosspost.postId));
      return 'deleted';
    }
    const deleted = await clientFor(crosspost.userId).deleteRecord(crosspost.rkey);
    if (deleted.ok) {
      if (crosspost.uri !== null) Result.unsafeUnwrap(await timelineItemsDeletedStore.deleteByUri(crosspost.uri));
      Result.unsafeUnwrap(await crosspostDeletedStore.delete(crosspost.postId));
      return 'deleted';
    }
    getLogger().warn(`Bluesky record could not be deleted: ${crosspost.postId}`, { reason: deleted.err.message });
    Result.unsafeUnwrap(
      await crosspostSavedStore.save(BlueskyCrosspost.markDeleteFailed(crosspost, deleted.err.message, now())),
    );
    return 'failed';
  };
