import { Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostDeletedStore,
  type BlueskyCrosspostSavedStore,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient } from '../../ports/blueskyClient.ts';

type Deps = Readonly<{
  client: BlueskyClient;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  now: () => Instant;
}>;

export const deleteBlueskyRecordWith = ({ client, crosspostSavedStore, crosspostDeletedStore, now }: Deps) =>
async (
  crosspost: BlueskyCrosspost,
): Promise<'deleted' | 'failed'> => {
  if (crosspost.rkey === null) {
    Result.unsafeUnwrap(await crosspostDeletedStore.delete(crosspost.postId));
    return 'deleted';
  }
  const deleted = await client.deleteRecord(crosspost.rkey);
  if (deleted.ok) {
    Result.unsafeUnwrap(await crosspostDeletedStore.delete(crosspost.postId));
    return 'deleted';
  }
  getLogger().warn(`Bluesky record could not be deleted: ${crosspost.postId}`, { reason: deleted.err.message });
  Result.unsafeUnwrap(
    await crosspostSavedStore.save(BlueskyCrosspost.markDeleteFailed(crosspost, deleted.err.message, now())),
  );
  return 'failed';
};
