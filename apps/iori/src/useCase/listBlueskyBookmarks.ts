import type { RA } from '@iwasa-kosui/result';

import type { BlueskyBookmarkReader, BlueskyBookmarksPage } from '../ports/blueskyBookmarkReader.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ cursor: string | undefined }>;

export type ListBlueskyBookmarksUseCase = UseCase<Input, BlueskyBookmarksPage, BlueskyClientError>;

type Deps = Readonly<{ reader: BlueskyBookmarkReader }>;

const create = ({ reader }: Deps): ListBlueskyBookmarksUseCase => {
  const run = (input: Input): RA<BlueskyBookmarksPage, BlueskyClientError> => reader.getBookmarks(input);

  return { run };
};

export const ListBlueskyBookmarksUseCase = {
  create,
} as const;
