import { RA } from '@iwasa-kosui/result';

import type { BlueskyInteraction } from '../domain/blueskyCrosspost/blueskyInteraction.ts';
import { blueskyPostUrlOfUri } from '../helper/blueskyUrl.ts';
import {
  type BlueskyPostImage,
  type PublishBlueskyPostError,
  publishBlueskyPostWithInteraction,
  type PublishBlueskyPostWithInteractionDeps,
} from './helper/publishBlueskyPost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ text: string; images: readonly BlueskyPostImage[]; interaction?: BlueskyInteraction }>;

type Ok = Readonly<{ uri: string; cid: string; url: string | null }>;

export type PostToBlueskyUseCase = UseCase<Input, Ok, PublishBlueskyPostError>;

type Deps = PublishBlueskyPostWithInteractionDeps;

const create = (deps: Deps): PostToBlueskyUseCase => {
  const run = async ({ text, images, interaction }: Input): RA<Ok, PublishBlueskyPostError> => {
    const published = await publishBlueskyPostWithInteraction(deps, { text, images, interaction });
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
