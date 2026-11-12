import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyFeedNotFound,
  type BlueskyFeedReader,
  type BlueskySavedFeed,
  isBlueskyFeedNotFound,
} from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string }>;

type Err = BlueskyClientError | BlueskyFeedNotFound;

export type GetBlueskyFeedInfoUseCase = UseCase<Input, BlueskySavedFeed, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'getFeedInfo'> }>;

const create = ({ reader }: Deps): GetBlueskyFeedInfoUseCase => ({
  run: async ({ uri }) => {
    const info = await reader.getFeedInfo(uri);
    if (info.ok) return info;
    return RA.err(isBlueskyFeedNotFound(info.err) ? { type: 'BlueskyFeedNotFound' } : info.err);
  },
});

export const GetBlueskyFeedInfoUseCase = {
  create,
} as const;
