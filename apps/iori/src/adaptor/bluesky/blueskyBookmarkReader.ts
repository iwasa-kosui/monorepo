import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyFetchedTimelineItem } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyBookmarkReader } from '../../ports/blueskyBookmarkReader.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { itemFromPostView, postViewZodType, toInstant } from './blueskyPostView.ts';

const BOOKMARKS_LIMIT = '30';

const pageZodType = z.object({ cursor: z.string().optional(), bookmarks: z.array(z.unknown()) });
const bookmarkViewZodType = z.looseObject({ item: postViewZodType });

const itemOf = (raw: unknown, fetchedAt: Instant): BlueskyFetchedTimelineItem | undefined => {
  const bookmark = bookmarkViewZodType.safeParse(raw);
  if (!bookmark.success) return undefined;
  const post = bookmark.data.item;
  const postedAt = toInstant(post.record.createdAt);
  const indexedAt = toInstant(post.indexedAt);
  if (postedAt === undefined || indexedAt === undefined) return undefined;
  const item = itemFromPostView(post, {
    fetchedAt,
    indexedAt,
    postedAt,
    repostedByDid: null,
    repostedByHandle: null,
    replyParentAuthorHandle: null,
  });
  return item === undefined ? undefined : { ...item, bookmarked: true };
};

export const createBlueskyBookmarkReader = (
  deps: Readonly<{ client: BlueskyQueryClient; now: () => Instant }>,
): BlueskyBookmarkReader => ({
  getBookmarks: async ({ cursor }) => {
    const response = await deps.client.query('app.bsky.bookmark.getBookmarks', {
      limit: BOOKMARKS_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!response.ok) return response;
    const page = pageZodType.safeParse(response.val);
    if (!page.success) {
      return RA.err({
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getBookmarks returned an unexpected response',
      });
    }
    const fetchedAt = deps.now();
    return RA.ok({
      items: page.data.bookmarks.flatMap((raw) => itemOf(raw, fetchedAt) ?? []),
      cursor: page.data.cursor,
    });
  },
});
