import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { blueskyLikeRkey } from '../../domain/blueskyTimeline/blueskyLike.ts';
import {
  BlueskyFetchedTimelineItem,
  BlueskyTimelineEmbed,
  type BlueskyTimelineFacet,
  blueskyTimelineFeedItemId,
} from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';

export type BlueskyTimelinePageParsed = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  dropped: number;
  cursor: string | undefined;
}>;

const REPOST_REASON = 'app.bsky.feed.defs#reasonRepost';
const POST_RECORD = 'app.bsky.feed.post';

const pageZodType = z.object({ cursor: z.string().optional(), feed: z.array(z.unknown()) });
const profileZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
});
const feedViewPostZodType = z.looseObject({
  post: z.looseObject({
    uri: z.string().min(1),
    cid: z.string().min(1),
    author: profileZodType,
    record: z.looseObject({
      $type: z.literal(POST_RECORD),
      text: z.string(),
      facets: z.array(z.unknown()).optional(),
      createdAt: z.string(),
      reply: z.looseObject({ parent: z.looseObject({ uri: z.string().min(1) }) }).optional(),
    }),
    embed: z.unknown().optional(),
    indexedAt: z.string(),
    viewer: z.looseObject({ like: z.string().optional() }).optional(),
  }),
  reply: z.looseObject({ parent: z.unknown() }).optional(),
  reason: z.unknown().optional(),
});
const reasonZodType = z.looseObject({ $type: z.string() });
const repostReasonZodType = z.looseObject({ by: profileZodType, indexedAt: z.string() });
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
const videoViewZodType = z.looseObject({ playlist: z.string(), thumbnail: z.string().optional() });
const recordViewZodType = z.looseObject({
  record: z.looseObject({
    uri: z.string().min(1),
    author: z.looseObject({ handle: z.string().min(1) }),
    value: z.looseObject({ text: z.string().optional() }),
  }),
});
const recordWithMediaViewZodType = z.looseObject({ record: z.unknown(), media: z.unknown() });
const parentAuthorZodType = z.looseObject({ author: z.looseObject({ handle: z.string().min(1) }) });

const toInstant = (value: string): Instant | undefined => {
  const parsed = Instant.of(Date.parse(value));
  return parsed.ok ? parsed.val : undefined;
};

const httpUrlOrNull = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
};

const facetOf = (raw: unknown): BlueskyTimelineFacet | undefined => {
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
      ? { type: 'video', thumbnail: view.data.thumbnail ?? null, playlist: view.data.playlist }
      : undefined;
  }
  return undefined;
};

const quoteOf = (raw: unknown): unknown => {
  const view = recordViewZodType.safeParse(raw);
  return view.success
    ? {
      type: 'record',
      uri: view.data.record.uri,
      authorHandle: view.data.record.author.handle,
      text: view.data.record.value.text ?? '',
    }
    : undefined;
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
      candidate = media !== null && record !== null && record.type === 'record'
        ? { type: 'recordWithMedia', media, record }
        : media ?? record;
    }
  } else {
    candidate = mediaOf(raw);
  }
  return embedFrom(candidate);
};

const itemOf = (raw: unknown, fetchedAt: Instant): BlueskyFetchedTimelineItem | undefined => {
  const feedViewPost = feedViewPostZodType.safeParse(raw);
  if (!feedViewPost.success) return undefined;
  const { post, reply, reason } = feedViewPost.data;
  const reasonType = reasonZodType.safeParse(reason);
  const repost = reasonType.success && reasonType.data.$type === REPOST_REASON
    ? repostReasonZodType.safeParse(reason)
    : undefined;
  if (repost !== undefined && !repost.success) return undefined;
  const repostedByDid = repost?.data.by.did ?? null;
  const postedAt = toInstant(post.record.createdAt);
  const indexedAt = toInstant(repost?.data.indexedAt ?? post.indexedAt);
  if (postedAt === undefined || indexedAt === undefined) return undefined;
  const parentAuthor = parentAuthorZodType.safeParse(reply?.parent);
  const viewerLike = post.viewer?.like;
  const viewerLikeUri = viewerLike !== undefined && blueskyLikeRkey(viewerLike) !== undefined ? viewerLike : null;
  const parsed = BlueskyFetchedTimelineItem.parse({
    feedItemId: blueskyTimelineFeedItemId(post.uri, repostedByDid),
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
    replyParentAuthorHandle: parentAuthor.success ? parentAuthor.data.author.handle : null,
    repostedByDid,
    repostedByHandle: repost?.data.by.handle ?? null,
    postedAt,
    indexedAt,
    fetchedAt,
    liked: viewerLikeUri !== null,
    viewerLikeUri,
  });
  return parsed.ok ? parsed.val : undefined;
};

export const parseBlueskyTimelineResponse = (
  payload: unknown,
  fetchedAt: Instant,
): Result<BlueskyTimelinePageParsed, 'invalid_response'> => {
  const page = pageZodType.safeParse(payload);
  if (!page.success) return Result.err('invalid_response');
  const items = page.data.feed.map((raw) => itemOf(raw, fetchedAt));
  return Result.ok({
    items: items.filter((item): item is BlueskyFetchedTimelineItem => item !== undefined),
    dropped: items.filter((item) => item === undefined).length,
    cursor: page.data.cursor,
  });
};
