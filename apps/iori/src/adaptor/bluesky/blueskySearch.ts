import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { BlueskySearch, BlueskySearchedActor } from '../../ports/blueskySearch.ts';
import { httpUrlOrNull, parseBlueskySearchPostsResponse } from './blueskyTimelineResponse.ts';

const actorsPageZodType = z.object({ cursor: z.string().optional(), actors: z.array(z.unknown()) });
const actorZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  description: z.string().optional(),
  viewer: z.looseObject({ following: z.string().optional() }).optional(),
});

const nonEmptyOrNull = (value: string | undefined): string | null => value === undefined || value === '' ? null : value;

const actorOf = (raw: unknown): BlueskySearchedActor | undefined => {
  const parsed = actorZodType.safeParse(raw);
  if (!parsed.success) return undefined;
  const { did, handle, displayName, avatar, description, viewer } = parsed.data;
  return {
    did,
    handle,
    displayName: nonEmptyOrNull(displayName),
    avatar: httpUrlOrNull(avatar),
    description: nonEmptyOrNull(description),
    followedByMe: viewer?.following !== undefined,
  };
};

const paramsOf = ({ q, cursor, limit }: Readonly<{ q: string; cursor?: string | undefined; limit: number }>) => ({
  q,
  limit: String(limit),
  ...(cursor === undefined ? {} : { cursor }),
});

export const createBlueskySearch = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskySearch => ({
  searchPosts: async (input) => {
    const response = await deps.client.query('app.bsky.feed.searchPosts', { ...paramsOf(input), sort: 'latest' });
    if (!response.ok) return response;
    const parsed = parseBlueskySearchPostsResponse(response.val, deps.now());
    return parsed.ok ? RA.ok(parsed.val) : RA.err({
      type: 'BlueskyClientError',
      kind: 'invalid_response',
      message: 'searchPosts returned an unexpected response',
    });
  },
  searchActors: async (input) => {
    const response = await deps.client.query('app.bsky.actor.searchActors', paramsOf(input));
    if (!response.ok) return response;
    const page = actorsPageZodType.safeParse(response.val);
    return page.success
      ? RA.ok({ actors: page.data.actors.flatMap((raw) => actorOf(raw) ?? []), cursor: page.data.cursor })
      : RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'searchActors returned an unexpected response',
      });
  },
});
