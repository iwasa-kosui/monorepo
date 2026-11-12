import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Instant } from '../instant/instant.ts';

export const BLUESKY_TIMELINE_RETENTION_DAYS = 30;
export const BLUESKY_TIMELINE_PAGE_LIMIT = 100;
export const BLUESKY_TIMELINE_MAX_PAGES = 5;
export const BLUESKY_TIMELINE_DEFAULT_LIMIT = 40;
export const BLUESKY_TIMELINE_MAX_LIMIT = 100;

const httpUrlZodType = z.string().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
});

const facetZodType = z.object({
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().nonnegative(),
  feature: z.discriminatedUnion('type', [
    z.object({ type: z.literal('link'), uri: z.string().min(1) }),
    z.object({ type: z.literal('mention'), did: z.string().min(1) }),
    z.object({ type: z.literal('tag'), tag: z.string().min(1) }),
  ]),
});

const imagesEmbedZodType = z.object({
  type: z.literal('images'),
  images: z.array(z.object({ thumb: httpUrlZodType, fullsize: httpUrlZodType, alt: z.string() })).min(1),
});
const externalEmbedZodType = z.object({
  type: z.literal('external'),
  uri: httpUrlZodType,
  title: z.string(),
  description: z.string(),
  thumb: httpUrlZodType.nullable(),
});
const videoEmbedZodType = z.object({
  type: z.literal('video'),
  thumbnail: httpUrlZodType.nullable(),
  playlist: httpUrlZodType,
  aspectRatio: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).nullable()
    .default(null),
  alt: z.string().nullable().default(null),
});
const recordEmbedZodType = z.object({
  type: z.literal('record'),
  uri: z.string().min(1),
  authorHandle: z.string().min(1),
  text: z.string(),
});
const mediaEmbedZodType = z.discriminatedUnion('type', [
  imagesEmbedZodType,
  externalEmbedZodType,
  videoEmbedZodType,
]);
const embedZodType = z.discriminatedUnion('type', [
  imagesEmbedZodType,
  externalEmbedZodType,
  videoEmbedZodType,
  recordEmbedZodType,
  z.object({ type: z.literal('recordWithMedia'), media: mediaEmbedZodType, record: recordEmbedZodType }),
]);

const blueskyTimelineItemZodType = z.object({
  feedItemId: z.string().min(1),
  uri: z.string().min(1),
  cid: z.string().min(1),
  authorDid: z.string().min(1),
  authorHandle: z.string().min(1),
  authorDisplayName: z.string().nullable(),
  authorAvatar: httpUrlZodType.nullable(),
  text: z.string(),
  facets: z.array(facetZodType),
  embed: embedZodType.nullable(),
  replyParentUri: z.string().nullable(),
  replyParentAuthorHandle: z.string().nullable(),
  repostedByDid: z.string().nullable(),
  repostedByHandle: z.string().nullable(),
  postedAt: Instant.zodType,
  indexedAt: Instant.zodType,
  fetchedAt: Instant.zodType,
  liked: z.boolean(),
  reposted: z.boolean(),
});
const blueskyFetchedTimelineItemZodType = blueskyTimelineItemZodType.extend({
  viewerLikeUri: z.string().min(1).nullable(),
  viewerRepostUri: z.string().min(1).nullable(),
});

export type BlueskyTimelineFacet = z.infer<typeof facetZodType>;
export type BlueskyTimelineEmbed = z.infer<typeof embedZodType>;
export type BlueskyTimelineItem = z.infer<typeof blueskyTimelineItemZodType>;
export const BlueskyTimelineItem = Schema.create(blueskyTimelineItemZodType);

export type BlueskyFetchedTimelineItem = z.infer<typeof blueskyFetchedTimelineItemZodType>;
export const BlueskyFetchedTimelineItem = Schema.create(blueskyFetchedTimelineItemZodType);

export const BlueskyTimelineEmbed = Schema.create(embedZodType);
export const BlueskyTimelineFacets = Schema.create(z.array(facetZodType));

export const blueskyTimelineFeedItemId = (uri: string, repostedByDid: string | null): string =>
  repostedByDid === null ? uri : `${uri}#repost:${repostedByDid}`;

export type BlueskyTimelineItemsResolver = Readonly<{
  resolve: (
    input: Readonly<{
      limit: number;
      before: Instant | undefined;
      beforeId?: string;
      excludeCrossposted?: boolean;
    }>,
  ) => RA<readonly BlueskyTimelineItem[], never>;
}>;
export type BlueskyTimelineExistingFeedItemIdsResolver = Readonly<{
  resolve: (feedItemIds: readonly string[]) => RA<readonly string[], never>;
}>;
export type BlueskyTimelineItemsSavedStore = Readonly<{
  save: (items: readonly BlueskyFetchedTimelineItem[]) => RA<readonly string[], never>;
}>;
export type BlueskyTimelineItemsExpiredStore = Readonly<{
  expire: (indexedBefore: Instant) => RA<void, never>;
}>;
export type BlueskyTimelineItemsDeletedStore = Readonly<{
  deleteByUri: (uri: string) => RA<void, never>;
}>;
