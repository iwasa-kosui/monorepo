import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyFeedReader, BlueskySavedFeeds } from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

export type ListBlueskySavedFeedsUseCase = UseCase<void, BlueskySavedFeeds, BlueskyClientError>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'listSavedFeeds'> }>;

const create = ({ reader }: Deps): ListBlueskySavedFeedsUseCase => ({
  run: () => reader.listSavedFeeds(),
});

export const ListBlueskySavedFeedsUseCase = {
  create,
} as const;
