import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { blueskyRepostRkey } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyViewerRepostResolver } from '../../ports/blueskyViewerRepostResolver.ts';

const responseZodType = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    viewer: z.looseObject({ repost: z.string().optional() }).optional(),
  })),
});

export const createBlueskyViewerRepostResolver = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyViewerRepostResolver => ({
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
    const repost = parsed.data.posts.find((post) => post.uri === postUri)?.viewer?.repost;
    return RA.ok(repost !== undefined && blueskyRepostRkey(repost) !== undefined ? repost : null);
  },
});
