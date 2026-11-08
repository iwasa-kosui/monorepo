import { RA } from '@iwasa-kosui/result';

import {
  type AllFeedSourcesResolver,
  FeedSource,
  FeedSourceAlreadyExistsError,
  type FeedSourceCreatedStore,
  type FeedSourceParseError,
  type NewFeedSourceInput,
} from '../domain/feedSource/feedSource.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

type Input = NewFeedSourceInput;

type Err = FeedSourceAlreadyExistsError | FeedSourceParseError;

export type AddFeedSourceUseCase = UseCase<Input, FeedSource, Err>;

type Deps = Readonly<{
  allFeedSourcesResolver: AllFeedSourcesResolver;
  feedSourceCreatedStore: FeedSourceCreatedStore;
  now: () => Instant;
}>;

const create = ({ allFeedSourcesResolver, feedSourceCreatedStore, now }: Deps): AddFeedSourceUseCase => {
  const run = async (input: Input): RA<FeedSource, Err> => {
    const parsed = FeedSource.parseNew(input);
    if (!parsed.ok) return RA.err(parsed.err);
    const registered = (await allFeedSourcesResolver.resolve()).val;
    if (registered.some((source) => source.url === parsed.val.url)) {
      return RA.err(FeedSourceAlreadyExistsError.create(parsed.val.url));
    }

    const created = FeedSource.createFeedSource(parsed.val, now());
    if (!created.ok) return RA.err(created.err);
    await feedSourceCreatedStore.store(created.val);
    return RA.ok(created.val.aggregateState);
  };

  return { run };
};

export const AddFeedSourceUseCase = { create } as const;
