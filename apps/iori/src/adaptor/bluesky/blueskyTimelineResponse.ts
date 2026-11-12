import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyFetchedTimelineItem } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { itemFromPostView, postViewZodType, profileZodType, toInstant } from './blueskyPostView.ts';

export type BlueskyTimelinePageParsed = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  dropped: number;
  cursor: string | undefined;
}>;

const REPOST_REASON = 'app.bsky.feed.defs#reasonRepost';

const pageZodType = z.object({ cursor: z.string().optional(), feed: z.array(z.unknown()) });
const feedViewPostZodType = z.looseObject({
  post: postViewZodType,
  reply: z.looseObject({ parent: z.unknown() }).optional(),
  reason: z.unknown().optional(),
});
const reasonZodType = z.looseObject({ $type: z.string() });
const repostReasonZodType = z.looseObject({ by: profileZodType, indexedAt: z.string() });
const parentAuthorZodType = z.looseObject({ author: z.looseObject({ handle: z.string().min(1) }) });

const itemOf = (raw: unknown, fetchedAt: Instant): BlueskyFetchedTimelineItem | undefined => {
  const feedViewPost = feedViewPostZodType.safeParse(raw);
  if (!feedViewPost.success) return undefined;
  const { post, reply, reason } = feedViewPost.data;
  const reasonType = reasonZodType.safeParse(reason);
  const repost = reasonType.success && reasonType.data.$type === REPOST_REASON
    ? repostReasonZodType.safeParse(reason)
    : undefined;
  if (repost !== undefined && !repost.success) return undefined;
  const postedAt = toInstant(post.record.createdAt);
  const indexedAt = toInstant(repost?.data.indexedAt ?? post.indexedAt);
  if (postedAt === undefined || indexedAt === undefined) return undefined;
  const parentAuthor = parentAuthorZodType.safeParse(reply?.parent);
  return itemFromPostView(post, {
    fetchedAt,
    indexedAt,
    postedAt,
    repostedByDid: repost?.data.by.did ?? null,
    repostedByHandle: repost?.data.by.handle ?? null,
    replyParentAuthorHandle: parentAuthor.success ? parentAuthor.data.author.handle : null,
  });
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

const searchPostsPageZodType = z.object({ cursor: z.string().optional(), posts: z.array(z.unknown()) });

export const parseBlueskySearchPostsResponse = (
  payload: unknown,
  fetchedAt: Instant,
): Result<
  Readonly<{ items: readonly BlueskyFetchedTimelineItem[]; cursor: string | undefined }>,
  'invalid_response'
> => {
  const page = searchPostsPageZodType.safeParse(payload);
  if (!page.success) return Result.err('invalid_response');
  return Result.ok({
    items: page.data.posts.flatMap((post) => itemOf({ post }, fetchedAt) ?? []),
    cursor: page.data.cursor,
  });
};
