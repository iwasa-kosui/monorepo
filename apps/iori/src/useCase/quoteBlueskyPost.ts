import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyQuoteNotAllowed, BlueskyQuoteTargetNotFound } from '../domain/blueskyTimeline/blueskyQuote.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyPostInvalid,
  publishBlueskyPost,
  type PublishBlueskyPostDeps,
  validateBlueskyPostInput,
} from './helper/publishBlueskyPost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string; text: string }>;

type Ok = Readonly<{ uri: string; cid: string }>;

type Err = BlueskyClientError | BlueskyPostInvalid | BlueskyQuoteTargetNotFound | BlueskyQuoteNotAllowed;

export type QuoteBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = PublishBlueskyPostDeps;

const getPostsResponseSchema = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    cid: z.string().min(1),
    viewer: z.looseObject({ embeddingDisabled: z.boolean().optional() }).optional(),
    author: z.looseObject({
      viewer: z.looseObject({
        blockedBy: z.boolean().optional(),
        blocking: z.string().optional(),
        blockingByList: z.looseObject({}).nullish(),
      }).optional(),
    }).optional(),
  })),
});

const create = (deps: Deps): QuoteBlueskyPostUseCase => {
  const run = async ({ uri, text }: Input): RA<Ok, Err> => {
    const problem = validateBlueskyPostInput({ text });
    if (problem !== undefined) return RA.err(problem);
    const response = await deps.query('app.bsky.feed.getPosts', { uris: uri });
    if (!response.ok) return RA.err(response.err);
    const parsed = getPostsResponseSchema.safeParse(response.val);
    if (!parsed.success) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getPosts returned an unexpected response',
      });
    }
    const post = parsed.data.posts.find((candidate) => candidate.uri === uri);
    if (post === undefined) return RA.err({ type: 'BlueskyQuoteTargetNotFound' });
    const authorViewer = post.author?.viewer;
    if (
      post.viewer?.embeddingDisabled === true || authorViewer?.blockedBy === true
      || authorViewer?.blocking !== undefined || (authorViewer?.blockingByList ?? null) !== null
    ) {
      return RA.err({ type: 'BlueskyQuoteNotAllowed' });
    }
    const published = await publishBlueskyPost(deps, { text, quote: { uri: post.uri, cid: post.cid } });
    return published.ok ? RA.ok({ uri: published.val.uri, cid: published.val.cid }) : RA.err(published.err);
  };

  return { run };
};

export const QuoteBlueskyPostUseCase = {
  create,
} as const;
