import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import {
  BLUESKY_BLOCK_COLLECTION,
  blueskyBlockUri,
  parseBlueskyBlockUri,
} from '../../domain/blueskyModeration/blueskyModeration.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../../ports/blueskyModerationReader.ts';

const profileZodType = z.looseObject({
  viewer: z.looseObject({
    muted: z.boolean().optional(),
    blocking: z.string().optional(),
  }).optional(),
});

export const createBlueskyModerationReader = (
  deps: Readonly<{ client: BlueskyQueryClient }>,
): BlueskyModerationReader => ({
  resolveViewerState: async (did) => {
    const response = await deps.client.query('app.bsky.actor.getProfile', { actor: did });
    if (!response.ok) return response;
    const parsed = profileZodType.safeParse(response.val);
    if (!parsed.success) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getProfile returned an unexpected response',
      });
    }
    return RA.ok({
      muted: parsed.data.viewer?.muted === true,
      blockUri: blueskyBlockUri(parsed.data.viewer?.blocking) ?? null,
    });
  },
  hasBlockRecord: async (blockUri) => {
    const parsed = parseBlueskyBlockUri(blockUri);
    if (parsed === undefined) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getRecord received an unexpected uri',
      });
    }
    const response = await deps.client.query('com.atproto.repo.getRecord', {
      repo: parsed.repo,
      collection: BLUESKY_BLOCK_COLLECTION,
      rkey: parsed.rkey,
    });
    if (response.ok) return RA.ok(true);
    return response.err.status === 404 || response.err.code === 'RecordNotFound' ? RA.ok(false) : response;
  },
});
