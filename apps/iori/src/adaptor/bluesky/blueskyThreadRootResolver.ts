import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyThreadRootResolver } from '../../ports/blueskyThreadRootResolver.ts';

const responseZodType = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    record: z.looseObject({
      reply: z.looseObject({ root: z.looseObject({ uri: z.string().min(1).optional() }).optional() }).optional(),
    }).optional(),
  })),
});

export const createBlueskyThreadRootResolver = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyThreadRootResolver => ({
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
    return RA.ok(post.record?.reply?.root?.uri ?? post.uri);
  },
});
