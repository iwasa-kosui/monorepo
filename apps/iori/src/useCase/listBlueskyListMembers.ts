import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyFeedNotFound,
  type BlueskyFeedReader,
  type BlueskyListMembersPage,
  isBlueskyFeedNotFound,
} from '../ports/blueskyFeedReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string; cursor: string | undefined }>;

type Err = BlueskyClientError | BlueskyFeedNotFound;

export type ListBlueskyListMembersUseCase = UseCase<Input, BlueskyListMembersPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'getListMembers'> }>;

const create = ({ reader }: Deps): ListBlueskyListMembersUseCase => ({
  run: async ({ uri, cursor }) => {
    const page = await reader.getListMembers({ uri, cursor });
    if (page.ok) return page;
    return RA.err(isBlueskyFeedNotFound(page.err) ? { type: 'BlueskyFeedNotFound' } : page.err);
  },
});

export const ListBlueskyListMembersUseCase = {
  create,
} as const;
