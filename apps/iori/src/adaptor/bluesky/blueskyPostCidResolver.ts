import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { blueskyLikeRkey } from '../../domain/blueskyTimeline/blueskyLike.ts';
import { blueskyRepostRkey } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../../ports/blueskyPostCidResolver.ts';

const responseZodType = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    cid: z.string().min(1),
    viewer: z.looseObject({ like: z.string().optional(), repost: z.string().optional() }).optional(),
  })),
});

export const createBlueskyPostCidResolver = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyPostCidResolver => ({
  resolve: async (postUri) => {
    const response = await deps.client.query('app.bsky.feed.getPosts', { uris: postUri });
    if (!response.ok) return response;
    const parsed = responseZodType.safeParse(response.val);
    if (!parsed.success) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getPosts returned an unexpected response',
      });
    }
    const post = parsed.data.posts.find((post) => post.uri === postUri);
    if (post === undefined) return RA.ok(undefined);
    const like = post.viewer?.like;
    const repost = post.viewer?.repost;
    return RA.ok({
      cid: post.cid,
      likeUri: like !== undefined && blueskyLikeRkey(like) !== undefined ? like : null,
      repostUri: repost !== undefined && blueskyRepostRkey(repost) !== undefined ? repost : null,
    });
  },
});
