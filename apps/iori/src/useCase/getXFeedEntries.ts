import type { XFeedEntriesResolver, XFeedEntry } from '../domain/feedEntry/xFeedEntry.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ limit: number }>;

export type GetXFeedEntriesUseCase = UseCase<Input, ReadonlyArray<XFeedEntry>, never>;

type Deps = Readonly<{
  xFeedEntriesResolver: XFeedEntriesResolver;
  now: () => Instant;
}>;

const create = ({ xFeedEntriesResolver, now }: Deps): GetXFeedEntriesUseCase => ({
  run: ({ limit }) => xFeedEntriesResolver.resolve({ limit, now: now() }),
});

export const GetXFeedEntriesUseCase = { create } as const;
