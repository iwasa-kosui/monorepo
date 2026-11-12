import z from 'zod/v4';

import { blueskyLikeRkey } from '../../domain/blueskyTimeline/blueskyLike.ts';
import { blueskyRepostRkey } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import {
  BlueskyFetchedTimelineItem,
  BlueskyTimelineEmbed,
  type BlueskyTimelineFacet,
  blueskyTimelineFeedItemId,
} from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';

const POST_RECORD = 'app.bsky.feed.post';

export const profileZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
});
export const postViewZodType = z.looseObject({
  uri: z.string().min(1),
  cid: z.string().min(1),
  author: profileZodType,
  record: z.looseObject({
    $type: z.literal(POST_RECORD),
    text: z.string(),
    facets: z.array(z.unknown()).optional(),
    createdAt: z.string(),
    reply: z.looseObject({
      parent: z.looseObject({ uri: z.string().min(1) }),
      root: z.looseObject({ uri: z.string().min(1) }).optional(),
    }).optional(),
  }),
  embed: z.unknown().optional(),
  indexedAt: z.string(),
  viewer: z.looseObject({
    like: z.string().optional(),
    repost: z.string().optional(),
    bookmarked: z.boolean().optional(),
    threadMuted: z.boolean().optional(),
  }).optional(),
});
export type BlueskyPostView = z.infer<typeof postViewZodType>;

const facetZodType = z.looseObject({
  index: z.looseObject({ byteStart: z.number(), byteEnd: z.number() }),
  features: z.array(z.looseObject({ $type: z.string() })),
});
const linkFeatureZodType = z.looseObject({ uri: z.string().min(1) });
const mentionFeatureZodType = z.looseObject({ did: z.string().min(1) });
const tagFeatureZodType = z.looseObject({ tag: z.string().min(1) });
const typedZodType = z.looseObject({ $type: z.string() });
const imagesViewZodType = z.looseObject({
  images: z.array(z.looseObject({ thumb: z.string(), fullsize: z.string(), alt: z.string().optional() })),
});
const externalViewZodType = z.looseObject({
  external: z.looseObject({
    uri: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    thumb: z.string().optional(),
  }),
});
const videoViewZodType = z.looseObject({
  playlist: z.string(),
  thumbnail: z.string().optional(),
  aspectRatio: z.looseObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional()
    .catch(undefined),
  alt: z.string().optional().catch(undefined),
});
const recordViewZodType = z.looseObject({ record: z.unknown() });
const quoteTargetZodType = z.looseObject({ $type: z.string().optional(), uri: z.string().min(1) });
const viewRecordZodType = z.looseObject({
  uri: z.string().min(1),
  author: z.looseObject({
    handle: z.string().min(1),
    displayName: z.string().optional(),
    avatar: z.string().optional(),
  }),
  value: z.looseObject({ text: z.string().optional() }),
  embeds: z.array(z.unknown()).optional(),
});
const QUOTE_UNAVAILABLE_REASONS = {
  'app.bsky.embed.record#viewNotFound': 'notFound',
  'app.bsky.embed.record#viewBlocked': 'blocked',
  'app.bsky.embed.record#viewDetached': 'detached',
} as const;
const recordWithMediaViewZodType = z.looseObject({ record: z.unknown(), media: z.unknown() });

export const toInstant = (value: string): Instant | undefined => {
  const parsed = Instant.of(Date.parse(value));
  return parsed.ok ? parsed.val : undefined;
};

export const httpUrlOrNull = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
};

export const facetOf = (raw: unknown): BlueskyTimelineFacet | undefined => {
  const facet = facetZodType.safeParse(raw);
  if (!facet.success) return undefined;
  const { byteStart, byteEnd } = facet.data.index;
  if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd) || byteStart < 0 || byteStart > byteEnd) {
    return undefined;
  }
  for (const feature of facet.data.features) {
    const link = feature.$type === 'app.bsky.richtext.facet#link' ? linkFeatureZodType.safeParse(feature) : undefined;
    if (link?.success) return { byteStart, byteEnd, feature: { type: 'link', uri: link.data.uri } };
    const mention = feature.$type === 'app.bsky.richtext.facet#mention'
      ? mentionFeatureZodType.safeParse(feature)
      : undefined;
    if (mention?.success) return { byteStart, byteEnd, feature: { type: 'mention', did: mention.data.did } };
    const tag = feature.$type === 'app.bsky.richtext.facet#tag' ? tagFeatureZodType.safeParse(feature) : undefined;
    if (tag?.success) return { byteStart, byteEnd, feature: { type: 'tag', tag: tag.data.tag } };
  }
  return undefined;
};

const embedFrom = (candidate: unknown): BlueskyTimelineEmbed | null => {
  const parsed = BlueskyTimelineEmbed.parse(candidate);
  return parsed.ok ? parsed.val : null;
};

const mediaOf = (raw: unknown): unknown => {
  const typed = typedZodType.safeParse(raw);
  if (!typed.success) return undefined;
  if (typed.data.$type === 'app.bsky.embed.images#view') {
    const view = imagesViewZodType.safeParse(raw);
    return view.success
      ? {
        type: 'images',
        images: view.data.images.map(({ thumb, fullsize, alt }) => ({ thumb, fullsize, alt: alt ?? '' })),
      }
      : undefined;
  }
  if (typed.data.$type === 'app.bsky.embed.external#view') {
    const view = externalViewZodType.safeParse(raw);
    return view.success
      ? {
        type: 'external',
        uri: view.data.external.uri,
        title: view.data.external.title ?? '',
        description: view.data.external.description ?? '',
        thumb: view.data.external.thumb ?? null,
      }
      : undefined;
  }
  if (typed.data.$type === 'app.bsky.embed.video#view') {
    const view = videoViewZodType.safeParse(raw);
    return view.success
      ? {
        type: 'video',
        thumbnail: view.data.thumbnail ?? null,
        playlist: view.data.playlist,
        aspectRatio: view.data.aspectRatio === undefined
          ? null
          : { width: view.data.aspectRatio.width, height: view.data.aspectRatio.height },
        alt: view.data.alt === undefined || view.data.alt === '' ? null : view.data.alt,
      }
      : undefined;
  }
  return undefined;
};

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

const quoteMediaSourceOf = (raw: unknown): unknown => {
  if (typedZodType.safeParse(raw).data?.$type !== 'app.bsky.embed.recordWithMedia#view') return raw;
  const view = recordWithMediaViewZodType.safeParse(raw);
  return view.success ? view.data.media : undefined;
};

const quoteOf = (raw: unknown): unknown => {
  const view = recordViewZodType.safeParse(raw);
  if (!view.success) return undefined;
  const target = quoteTargetZodType.safeParse(view.data.record);
  if (!target.success) return undefined;
  const { $type, uri } = target.data;
  if ($type !== undefined && Object.hasOwn(QUOTE_UNAVAILABLE_REASONS, $type)) {
    return {
      type: 'recordUnavailable',
      uri,
      reason: QUOTE_UNAVAILABLE_REASONS[$type as keyof typeof QUOTE_UNAVAILABLE_REASONS],
    };
  }
  if ($type !== undefined && $type !== 'app.bsky.embed.record#viewRecord') return undefined;
  const record = viewRecordZodType.safeParse(view.data.record);
  if (!record.success) return undefined;
  const { author, value } = record.data;
  const media = embedFrom(mediaOf(quoteMediaSourceOf(record.data.embeds?.[0])));
  return {
    type: 'record',
    uri: record.data.uri,
    authorHandle: author.handle,
    text: value.text ?? '',
    authorDisplayName: nonEmpty(author.displayName),
    authorAvatar: httpUrlOrNull(author.avatar) ?? undefined,
    media: media !== null && (media.type === 'images' || media.type === 'external' || media.type === 'video')
      ? media
      : undefined,
  };
};

const embedOf = (raw: unknown): BlueskyTimelineEmbed | null => {
  const typed = typedZodType.safeParse(raw);
  if (!typed.success) return null;
  let candidate: unknown;
  if (typed.data.$type === 'app.bsky.embed.record#view') {
    candidate = quoteOf(raw);
  } else if (typed.data.$type === 'app.bsky.embed.recordWithMedia#view') {
    const view = recordWithMediaViewZodType.safeParse(raw);
    if (view.success) {
      const media = embedFrom(mediaOf(view.data.media));
      const record = embedFrom(quoteOf(view.data.record));
      candidate = media !== null && record !== null && (record.type === 'record' || record.type === 'recordUnavailable')
        ? { type: 'recordWithMedia', media, record }
        : media ?? record;
    }
  } else {
    candidate = mediaOf(raw);
  }
  return embedFrom(candidate);
};

export type BlueskyPostViewContext = Readonly<{
  fetchedAt: Instant;
  indexedAt: Instant;
  postedAt: Instant;
  repostedByDid: string | null;
  repostedByHandle: string | null;
  replyParentAuthorHandle: string | null;
}>;

export const itemFromPostView = (
  post: BlueskyPostView,
  context: BlueskyPostViewContext,
): BlueskyFetchedTimelineItem | undefined => {
  const viewerLike = post.viewer?.like;
  const viewerLikeUri = viewerLike !== undefined && blueskyLikeRkey(viewerLike) !== undefined ? viewerLike : null;
  const viewerRepost = post.viewer?.repost;
  const viewerRepostUri = viewerRepost !== undefined && blueskyRepostRkey(viewerRepost) !== undefined
    ? viewerRepost
    : null;
  const parsed = BlueskyFetchedTimelineItem.parse({
    feedItemId: blueskyTimelineFeedItemId(post.uri, context.repostedByDid),
    uri: post.uri,
    cid: post.cid,
    authorDid: post.author.did,
    authorHandle: post.author.handle,
    authorDisplayName: post.author.displayName === undefined || post.author.displayName === ''
      ? null
      : post.author.displayName,
    authorAvatar: httpUrlOrNull(post.author.avatar),
    text: post.record.text,
    facets: (post.record.facets ?? []).flatMap((facet) => facetOf(facet) ?? []),
    embed: embedOf(post.embed),
    replyParentUri: post.record.reply?.parent.uri ?? null,
    replyParentAuthorHandle: context.replyParentAuthorHandle,
    repostedByDid: context.repostedByDid,
    repostedByHandle: context.repostedByHandle,
    postedAt: context.postedAt,
    indexedAt: context.indexedAt,
    fetchedAt: context.fetchedAt,
    liked: viewerLikeUri !== null,
    viewerLikeUri,
    reposted: viewerRepostUri !== null,
    viewerRepostUri,
    bookmarked: post.viewer?.bookmarked === true,
    threadMuted: post.viewer?.threadMuted === true,
    replyRootUri: post.record.reply?.root?.uri ?? null,
  });
  return parsed.ok ? parsed.val : undefined;
};
