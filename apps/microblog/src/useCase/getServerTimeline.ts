import { RA } from '@iwasa-kosui/result';

import { type LocalPostsResolver, PgLocalPostsResolver } from '../adaptor/pg/post/localPostsResolver.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { PostQuery } from '../domain/post/post.ts';
import { singleton } from '../helper/singleton.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  createdAt: Instant | undefined;
  limit?: number;
}>;

type Ok = Readonly<{
  posts: ReadonlyArray<PostQuery>;
}>;

type Err = never;

export type GetServerTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  localPostsResolver: LocalPostsResolver;
}>;

const create = ({ localPostsResolver }: Deps): GetServerTimelineUseCase => {
  const run = (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andThen(({ createdAt, limit }) => localPostsResolver.resolve({ createdAt, limit })),
      RA.map((posts) => ({ posts })),
    );

  return { run };
};

export const GetServerTimelineUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      localPostsResolver: PgLocalPostsResolver.getInstance(),
    })
  ),
} as const;
