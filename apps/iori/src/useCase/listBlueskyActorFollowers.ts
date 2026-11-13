import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyListMembersPage } from '../ports/blueskyFeedReader.ts';
import {
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ actor: string; cursor: string | undefined }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type ListBlueskyActorFollowersUseCase = UseCase<Input, BlueskyListMembersPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyProfileReader, 'getFollowers'> }>;

const create = ({ reader }: Deps): ListBlueskyActorFollowersUseCase => {
  const run = async (input: Input): RA<BlueskyListMembersPage, Err> => {
    const page = await reader.getFollowers(input);
    if (page.ok) return page;
    return RA.err(isBlueskyProfileNotFound(page.err) ? { type: 'BlueskyProfileNotFound' } : page.err);
  };

  return { run };
};

export const ListBlueskyActorFollowersUseCase = {
  create,
} as const;
