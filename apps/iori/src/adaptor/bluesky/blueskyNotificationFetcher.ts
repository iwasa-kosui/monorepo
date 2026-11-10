import { RA } from '@iwasa-kosui/result';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyNotificationFetcher } from '../../ports/blueskyNotificationFetcher.ts';
import { parseBlueskyNotificationResponse } from './blueskyNotificationResponse.ts';

export const createBlueskyNotificationFetcher = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyNotificationFetcher => ({
  fetch: async ({ limit, cursor }) => {
    const response = await deps.client.query('app.bsky.notification.listNotifications', {
      limit: String(limit),
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const parsed = parseBlueskyNotificationResponse(response.val);
    return parsed.ok ? RA.ok(parsed.val) : RA.err({
      type: 'BlueskyClientError',
      kind: 'invalid_response',
      message: 'listNotifications returned an unexpected response',
    });
  },
});
