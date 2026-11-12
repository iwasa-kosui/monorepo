import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyFeedNotFound,
  type BlueskyFeedPostsPage,
  type BlueskyFeedReader,
  isBlueskyFeedNotFound,
} from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string; cursor: string | undefined }>;

type Err = BlueskyClientError | BlueskyFeedNotFound;

export type ListBlueskyFeedPostsUseCase = UseCase<Input, BlueskyFeedPostsPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'getFeedPosts'> }>;

const create = ({ reader }: Deps): ListBlueskyFeedPostsUseCase => ({
  run: async ({ uri, cursor }) => {
    const page = await reader.getFeedPosts({ uri, cursor });
    if (page.ok) return page;
    return RA.err(isBlueskyFeedNotFound(page.err) ? { type: 'BlueskyFeedNotFound' } : page.err);
  },
});

export const ListBlueskyFeedPostsUseCase = {
  create,
} as const;
