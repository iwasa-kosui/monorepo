import { RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyLikeTargetResolver } from '../domain/blueskyTimeline/blueskyLike.ts';
import type { BlueskyReplyNotAllowed, BlueskyReplyTargetNotFound } from '../domain/blueskyTimeline/blueskyReply.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyPostInvalid,
  publishBlueskyPost,
  type PublishBlueskyPostDeps,
  validateBlueskyPostInput,
} from './helper/publishBlueskyPost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string; text: string }> | Readonly<{ uri: string; text: string }>;

type Ok = Readonly<{ uri: string; cid: string }>;

type Err = BlueskyClientError | BlueskyPostInvalid | BlueskyReplyTargetNotFound | BlueskyReplyNotAllowed;

export type ReplyToBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = PublishBlueskyPostDeps & Readonly<{ targetResolver: BlueskyLikeTargetResolver }>;

const strongRefSchema = z.object({ uri: z.string().min(1), cid: z.string().min(1) });
const getPostsResponseSchema = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    cid: z.string().min(1),
    record: z.looseObject({ reply: z.looseObject({ root: strongRefSchema }).optional() }).optional(),
    viewer: z.looseObject({ replyDisabled: z.boolean().optional() }).optional(),
    author: z.looseObject({
      viewer: z.looseObject({ blockedBy: z.boolean().optional(), blocking: z.string().optional() }).optional(),
    }).optional(),
  })),
});

const create = (deps: Deps): ReplyToBlueskyPostUseCase => {
  const run = async (input: Input): RA<Ok, Err> => {
    const { text } = input;
    const problem = validateBlueskyPostInput({ text });
    if (problem !== undefined) return RA.err(problem);
    const target = 'feedItemId' in input
      ? Result.unsafeUnwrap(await deps.targetResolver.resolve(input.feedItemId))
      : { uri: input.uri };
    if (target === undefined) return RA.err({ type: 'BlueskyReplyTargetNotFound' });
    const response = await deps.query('app.bsky.feed.getPosts', { uris: target.uri });
    if (!response.ok) return RA.err(response.err);
    const parsed = getPostsResponseSchema.safeParse(response.val);
    if (!parsed.success) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getPosts returned an unexpected response',
      });
    }
    const post = parsed.data.posts.find(({ uri }) => uri === target.uri);
    if (post === undefined) return RA.err({ type: 'BlueskyReplyTargetNotFound' });
    const authorViewer = post.author?.viewer;
    if (
      post.viewer?.replyDisabled === true || authorViewer?.blockedBy === true || authorViewer?.blocking !== undefined
    ) {
      return RA.err({ type: 'BlueskyReplyNotAllowed' });
    }
    const parent = { uri: post.uri, cid: post.cid };
    const published = await publishBlueskyPost(deps, {
      text,
      reply: { root: post.record?.reply?.root ?? parent, parent },
    });
    return published.ok ? RA.ok({ uri: published.val.uri, cid: published.val.cid }) : RA.err(published.err);
  };

  return { run };
};

export const ReplyToBlueskyPostUseCase = {
  create,
} as const;
