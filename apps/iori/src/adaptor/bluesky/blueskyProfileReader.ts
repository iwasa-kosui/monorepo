import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { type BlueskyProfileReader, isBlueskyActorBlocked } from '../../ports/blueskyProfileReader.ts';
import { httpUrlOrNull } from './blueskyPostView.ts';
import { actorOf } from './blueskySearch.ts';
import { parseBlueskyTimelineResponse } from './blueskyTimelineResponse.ts';

const AUTHOR_FEED_LIMIT = '30';
const FOLLOW_LIST_LIMIT = '50';

const profileZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  banner: z.string().optional(),
  followersCount: z.number().int().nonnegative().optional(),
  followsCount: z.number().int().nonnegative().optional(),
  postsCount: z.number().int().nonnegative().optional(),
  viewer: z.looseObject({ following: z.string().optional(), followedBy: z.string().optional() }).optional(),
});

const followsZodType = z.looseObject({ cursor: z.string().optional(), follows: z.array(z.unknown()) });
const followersZodType = z.looseObject({ cursor: z.string().optional(), followers: z.array(z.unknown()) });

const invalidResponse = (operation: string): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'invalid_response',
  message: `${operation} returned an unexpected response`,
});

const textOrNull = (value: string | undefined): string | null => value === undefined || value === '' ? null : value;

export const createBlueskyProfileReader = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskyProfileReader => ({
  getProfile: async (actor) => {
    const response = await deps.client.query('app.bsky.actor.getProfile', { actor });
    if (!response.ok) return response;
    const parsed = profileZodType.safeParse(response.val);
    if (!parsed.success) return RA.err(invalidResponse('getProfile'));
    const profile = parsed.data;
    return RA.ok({
      did: profile.did,
      handle: profile.handle,
      displayName: textOrNull(profile.displayName),
      description: textOrNull(profile.description),
      avatar: httpUrlOrNull(profile.avatar),
      banner: httpUrlOrNull(profile.banner),
      followersCount: profile.followersCount ?? 0,
      followsCount: profile.followsCount ?? 0,
      postsCount: profile.postsCount ?? 0,
      viewerFollowingUri: profile.viewer?.following,
      viewerFollowedBy: profile.viewer?.followedBy !== undefined,
    });
  },
  getAuthorFeed: async ({ actor, cursor, filter }) => {
    const response = await deps.client.query('app.bsky.feed.getAuthorFeed', {
      actor,
      limit: AUTHOR_FEED_LIMIT,
      filter,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) {
      return isBlueskyActorBlocked(response.err)
        ? RA.ok({ items: [], cursor: undefined, unavailable: 'blocked' })
        : response;
    }
    const parsed = parseBlueskyTimelineResponse(response.val, deps.now());
    return parsed.ok
      ? RA.ok({ items: parsed.val.items, cursor: parsed.val.cursor, unavailable: null })
      : RA.err(invalidResponse('getAuthorFeed'));
  },
  getActorLikes: async ({ actor, cursor }) => {
    const response = await deps.client.query('app.bsky.feed.getActorLikes', {
      actor,
      limit: AUTHOR_FEED_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const parsed = parseBlueskyTimelineResponse(response.val, deps.now());
    return parsed.ok
      ? RA.ok({ items: parsed.val.items, cursor: parsed.val.cursor })
      : RA.err(invalidResponse('getActorLikes'));
  },
  getFollows: async ({ actor, cursor }) => {
    const response = await deps.client.query('app.bsky.graph.getFollows', {
      actor,
      limit: FOLLOW_LIST_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const parsed = followsZodType.safeParse(response.val);
    if (!parsed.success) return RA.err(invalidResponse('getFollows'));
    return RA.ok({ actors: parsed.data.follows.flatMap((raw) => actorOf(raw) ?? []), cursor: parsed.data.cursor });
  },
  getFollowers: async ({ actor, cursor }) => {
    const response = await deps.client.query('app.bsky.graph.getFollowers', {
      actor,
      limit: FOLLOW_LIST_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const parsed = followersZodType.safeParse(response.val);
    if (!parsed.success) return RA.err(invalidResponse('getFollowers'));
    return RA.ok({ actors: parsed.data.followers.flatMap((raw) => actorOf(raw) ?? []), cursor: parsed.data.cursor });
  },
});
