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

export type ListBlueskyActorFollowsUseCase = UseCase<Input, BlueskyListMembersPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyProfileReader, 'getFollows'> }>;

const create = ({ reader }: Deps): ListBlueskyActorFollowsUseCase => {
  const run = async (input: Input): RA<BlueskyListMembersPage, Err> => {
    const page = await reader.getFollows(input);
    if (page.ok) return page;
    return RA.err(isBlueskyProfileNotFound(page.err) ? { type: 'BlueskyProfileNotFound' } : page.err);
  };

  return { run };
};

export const ListBlueskyActorFollowsUseCase = {
  create,
} as const;
