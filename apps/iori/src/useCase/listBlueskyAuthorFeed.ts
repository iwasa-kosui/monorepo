import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyAuthorFeedFilter,
  type BlueskyAuthorFeedPage,
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ actor: string; cursor: string | undefined; filter: BlueskyAuthorFeedFilter }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type ListBlueskyAuthorFeedUseCase = UseCase<Input, BlueskyAuthorFeedPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyProfileReader, 'getAuthorFeed'> }>;

const create = ({ reader }: Deps): ListBlueskyAuthorFeedUseCase => {
  const run = async (input: Input): RA<BlueskyAuthorFeedPage, Err> => {
    const page = await reader.getAuthorFeed(input);
    if (page.ok) return page;
    return RA.err(isBlueskyProfileNotFound(page.err) ? { type: 'BlueskyProfileNotFound' } : page.err);
  };

  return { run };
};

export const ListBlueskyAuthorFeedUseCase = {
  create,
} as const;
