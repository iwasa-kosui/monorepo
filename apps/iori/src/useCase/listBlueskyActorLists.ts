import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyFeedReader, BlueskyFeedsPage } from '../ports/blueskyFeedReader.ts';
import { type BlueskyProfileNotFound, isBlueskyProfileNotFound } from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ actor: string; cursor: string | undefined }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type ListBlueskyActorListsUseCase = UseCase<Input, BlueskyFeedsPage, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyFeedReader, 'getActorLists'> }>;

const create = ({ reader }: Deps): ListBlueskyActorListsUseCase => ({
  run: async ({ actor, cursor }) => {
    const page = await reader.getActorLists({ actor, cursor });
    if (page.ok) return page;
    return RA.err(isBlueskyProfileNotFound(page.err) ? { type: 'BlueskyProfileNotFound' } : page.err);
  },
});

export const ListBlueskyActorListsUseCase = {
  create,
} as const;
