import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyFeedPostsPage, BlueskyFeedReader } from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string; cursor: string | undefined }>;

export type ListBlueskyFeedPostsUseCase = UseCase<Input, BlueskyFeedPostsPage, BlueskyClientError>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'getFeedPosts'> }>;

const create = ({ reader }: Deps): ListBlueskyFeedPostsUseCase => ({
  run: ({ uri, cursor }) => reader.getFeedPosts({ uri, cursor }),
});

export const ListBlueskyFeedPostsUseCase = {
  create,
} as const;
