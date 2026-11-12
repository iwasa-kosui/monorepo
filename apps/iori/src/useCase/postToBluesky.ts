import { RA } from '@iwasa-kosui/result';

import { blueskyPostUrlOfUri } from '../helper/blueskyUrl.ts';
import {
  type BlueskyPostImage,
  publishBlueskyPost,
  type PublishBlueskyPostDeps,
  type PublishBlueskyPostError,
} from './helper/publishBlueskyPost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ text: string; images: readonly BlueskyPostImage[] }>;

type Ok = Readonly<{ uri: string; cid: string; url: string | null }>;

export type PostToBlueskyUseCase = UseCase<Input, Ok, PublishBlueskyPostError>;

type Deps = PublishBlueskyPostDeps;

const create = (deps: Deps): PostToBlueskyUseCase => {
  const run = async ({ text, images }: Input): RA<Ok, PublishBlueskyPostError> => {
    const published = await publishBlueskyPost(deps, { text, images });
    return published.ok
      ? RA.ok({
        uri: published.val.uri,
        cid: published.val.cid,
        url: blueskyPostUrlOfUri(published.val.uri) ?? null,
      })
      : RA.err(published.err);
  };

  return { run };
};

export const PostToBlueskyUseCase = {
  create,
} as const;
