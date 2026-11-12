import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyPostThreadFetcher } from '../../ports/blueskyPostThreadFetcher.ts';
import { parseBlueskyPostThreadResponse } from './blueskyPostThreadResponse.ts';

export const BLUESKY_THREAD_DEPTH = 6;
export const BLUESKY_THREAD_PARENT_HEIGHT = 40;

export const createBlueskyPostThreadFetcher = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskyPostThreadFetcher => ({
  fetch: async ({ uri }) => {
    const response = await deps.client.query('app.bsky.feed.getPostThread', {
      uri,
      depth: String(BLUESKY_THREAD_DEPTH),
      parentHeight: String(BLUESKY_THREAD_PARENT_HEIGHT),
    });
    if (!response.ok) return response;
    const parsed = parseBlueskyPostThreadResponse(response.val, deps.now());
    if (parsed.ok) return RA.ok(parsed.val);
    return parsed.err === 'invalid_response'
      ? RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getPostThread returned an unexpected response',
      })
      : RA.err({ type: 'BlueskyPostThreadUnavailable', reason: parsed.err });
  },
});
