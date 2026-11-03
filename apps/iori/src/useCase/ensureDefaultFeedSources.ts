import { RA } from '@iwasa-kosui/result';

import { defaultFeedSources } from '../domain/feedSource/defaultFeedSources.ts';
import {
  FeedSource,
  type FeedSourceCreated,
  type FeedSourceCreatedStore,
  type FeedSourceResolverByUrl,
} from '../domain/feedSource/feedSource.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

type Input = void;

type Ok = Readonly<{ created: number }>;

type Err = never;

export type EnsureDefaultFeedSourcesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  feedSourceResolverByUrl: FeedSourceResolverByUrl;
  feedSourceCreatedStore: FeedSourceCreatedStore;
  now: () => Instant;
}>;

const create = ({
  feedSourceResolverByUrl,
  feedSourceCreatedStore,
  now,
}: Deps): EnsureDefaultFeedSourcesUseCase => {
  const run = async (): RA<Ok, Err> => {
    const events: FeedSourceCreated[] = [];
    for (const defaultFeedSource of defaultFeedSources) {
      const resolved = await feedSourceResolverByUrl.resolve({ url: defaultFeedSource.url });
      if (resolved.val !== undefined) continue;
      const created = FeedSource.createFeedSource(defaultFeedSource, now());
      if (!created.ok) throw new Error(`Invalid default feed source: ${created.err.message}`);
      events.push(created.val);
    }
    if (events.length > 0) await feedSourceCreatedStore.store(...events);
    return RA.ok({ created: events.length });
  };

  return { run };
};

export const EnsureDefaultFeedSourcesUseCase = {
  create,
} as const;
