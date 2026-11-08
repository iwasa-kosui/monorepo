import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyTimelineFetcher } from '../../ports/blueskyTimelineFetcher.ts';
import { parseBlueskyTimelineResponse } from './blueskyTimelineResponse.ts';

export const createBlueskyTimelineFetcher = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskyTimelineFetcher => ({
  fetch: async ({ limit, cursor }) => {
    const response = await deps.client.query('app.bsky.feed.getTimeline', {
      limit: String(limit),
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const parsed = parseBlueskyTimelineResponse(response.val, deps.now());
    return parsed.ok ? RA.ok(parsed.val) : RA.err({
      type: 'BlueskyClientError',
      kind: 'invalid_response',
      message: 'getTimeline returned an unexpected response',
    });
  },
});
