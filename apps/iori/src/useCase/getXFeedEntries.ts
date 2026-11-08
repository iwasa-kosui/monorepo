import type { XFeedEntriesResolver, XFeedEntry } from '../domain/feedEntry/xFeedEntry.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ limit: number }>;

export type GetXFeedEntriesUseCase = UseCase<Input, ReadonlyArray<XFeedEntry>, never>;

type Deps = Readonly<{
  xFeedEntriesResolver: XFeedEntriesResolver;
}>;

const create = ({ xFeedEntriesResolver }: Deps): GetXFeedEntriesUseCase => ({
  run: ({ limit }) => xFeedEntriesResolver.resolve({ limit }),
});

export const GetXFeedEntriesUseCase = { create } as const;
