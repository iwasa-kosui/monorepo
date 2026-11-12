import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_MODERATION_SYNC_GRACE_MS,
  type BlueskyBlockDeletedStore,
  type BlueskyBlockSavedStore,
  type BlueskyModeratedActorsResolver,
  type BlueskyModerationState,
  type BlueskyMuteDeletedStore,
  type BlueskyMuteSavedStore,
} from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../ports/blueskyModerationReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

export type GetBlueskyModerationStateUseCase = UseCase<Input, BlueskyModerationState, BlueskyClientError>;

type Deps = Readonly<{
  reader: BlueskyModerationReader;
  resolver: Pick<BlueskyModeratedActorsResolver, 'resolveState' | 'resolveUpdatedAt'>;
  muteSavedStore: BlueskyMuteSavedStore;
  muteDeletedStore: BlueskyMuteDeletedStore;
  blockSavedStore: BlueskyBlockSavedStore;
  blockDeletedStore: BlueskyBlockDeletedStore;
  now: () => Instant;
}>;

const create = (
  { reader, resolver, muteSavedStore, muteDeletedStore, blockSavedStore, blockDeletedStore, now }: Deps,
): GetBlueskyModerationStateUseCase => {
  const syncStored = async (did: string, viewer: BlueskyModerationState): Promise<void> => {
    const updatedAt = Result.unsafeUnwrap(await resolver.resolveUpdatedAt(did));
    if (updatedAt !== undefined && now() - updatedAt <= BLUESKY_MODERATION_SYNC_GRACE_MS) return;
    const stored = Result.unsafeUnwrap(await resolver.resolveState(did));
    if (stored.muted !== viewer.muted) {
      Result.unsafeUnwrap(
        viewer.muted ? await muteSavedStore.save(did, now()) : await muteDeletedStore.delete(did, now()),
      );
    }
    if (stored.blockUri !== viewer.blockUri) {
      Result.unsafeUnwrap(
        viewer.blockUri === null
          ? await blockDeletedStore.delete(did, now())
          : await blockSavedStore.save(did, viewer.blockUri, now()),
      );
    }
  };

  const run = async ({ did }: Input): RA<BlueskyModerationState, BlueskyClientError> => {
    const viewer = await reader.resolveViewerState(did);
    if (!viewer.ok) return viewer;
    try {
      await syncStored(did, viewer.val);
    } catch (error) {
      console.error('iori bluesky moderation: failed to sync the stored state with the viewer state.', { did, error });
    }
    return viewer;
  };

  return { run };
};

export const GetBlueskyModerationStateUseCase = {
  create,
} as const;
