import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyMutedActorsSyncedStore } from '../domain/blueskyTimeline/blueskyMutedActor.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyMutedActorsFetcher } from '../ports/blueskyMutedActorsFetcher.ts';
import type { UseCase } from './useCase.ts';

type Ok = Readonly<{ muted: number; added: number; removed: number }>;

export type SyncBlueskyMutedActorsUseCase = UseCase<void, Ok, BlueskyClientError>;

type Deps = Readonly<{
  fetcher: BlueskyMutedActorsFetcher;
  syncedStore: BlueskyMutedActorsSyncedStore;
}>;

/**
 * Bluesky でミュートしているアカウントを取り込む。
 * getTimeline はミュート中のアカウントの投稿を返さないが、ミュートする前に取り込んだ投稿は D1 に残るため、
 * タイムラインを返すときにこの一覧で除く。取得に失敗したときは前回の一覧を残す。
 */
const create = ({ fetcher, syncedStore }: Deps): SyncBlueskyMutedActorsUseCase => ({
  run: async () => {
    const fetched = await fetcher.fetch();
    if (!fetched.ok) return fetched;
    const synced = Result.unsafeUnwrap(await syncedStore.sync(fetched.val));
    return RA.ok({ muted: new Set(fetched.val).size, ...synced });
  },
});

export const SyncBlueskyMutedActorsUseCase = {
  create,
} as const;
