import { RA } from '@iwasa-kosui/result';

import {
  type AllFeedSourcesResolver,
  FeedSource,
  type FeedSourceEnabledChangedStore,
  FeedSourceNotFoundError,
} from '../domain/feedSource/feedSource.ts';
import type { FeedSourceId } from '../domain/feedSource/feedSourceId.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedSourceId: FeedSourceId; enabled: boolean }>;

type Err = FeedSourceNotFoundError;

export type ChangeFeedSourceEnabledUseCase = UseCase<Input, FeedSource, Err>;

type Deps = Readonly<{
  allFeedSourcesResolver: AllFeedSourcesResolver;
  feedSourceEnabledChangedStore: FeedSourceEnabledChangedStore;
  now: () => Instant;
}>;

const create = ({
  allFeedSourcesResolver,
  feedSourceEnabledChangedStore,
  now,
}: Deps): ChangeFeedSourceEnabledUseCase => {
  const run = async ({ feedSourceId, enabled }: Input): RA<FeedSource, Err> => {
    const source = (await allFeedSourcesResolver.resolve()).val.find((item) => item.feedSourceId === feedSourceId);
    if (source === undefined) return RA.err(FeedSourceNotFoundError.create(feedSourceId));
    if (source.enabled === enabled) return RA.ok(source);

    const changed = FeedSource.setEnabled(source, enabled, now());
    await feedSourceEnabledChangedStore.store(changed);
    return RA.ok(changed.aggregateState);
  };

  return { run };
};

export const ChangeFeedSourceEnabledUseCase = { create } as const;
