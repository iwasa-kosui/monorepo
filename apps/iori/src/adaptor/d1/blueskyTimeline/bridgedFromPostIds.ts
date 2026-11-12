import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { BlueskyTimelineItem } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { postsTable, remotePostsTable } from '../schema.ts';

const BRIDGY_AP_HANDLE_SUFFIX = '.ap.brid.gy';

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

// Bridgy Fed は Fediverse の投稿を *.ap.brid.gy のアカウントで Bluesky に出し、元の投稿の url を bridgyOriginalUrl に入れる
const originalUrlOf = (item: BlueskyTimelineItem): string | null =>
  item.bridgyOriginalUrl !== null && item.authorHandle.endsWith(BRIDGY_AP_HANDLE_SUFFIX)
    ? withoutTrailingSlash(item.bridgyOriginalUrl)
    : null;

export const withBridgedFromPostIds = async (
  db: IoriD1Db,
  items: readonly BlueskyTimelineItem[],
): Promise<readonly BlueskyTimelineItem[]> => {
  const originalUrls = [...new Set(items.flatMap((item) => originalUrlOf(item) ?? []))];
  if (originalUrls.length === 0) return items;
  const candidates = originalUrls.flatMap((url) => [url, `${url}/`]);
  const rows = await db.select({
    postId: remotePostsTable.postId,
    uri: remotePostsTable.uri,
    url: remotePostsTable.url,
  })
    .from(remotePostsTable)
    .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
    .where(and(
      isNull(postsTable.deletedAt),
      or(inArray(remotePostsTable.uri, jsonEach(candidates)), inArray(remotePostsTable.url, jsonEach(candidates))),
    ))
    .orderBy(remotePostsTable.postId);
  const postIdByUrl = new Map<string, string>();
  for (const { postId, uri } of rows) postIdByUrl.set(withoutTrailingSlash(uri), postId);
  for (const { postId, url } of rows) {
    if (url !== null && !postIdByUrl.has(withoutTrailingSlash(url))) postIdByUrl.set(withoutTrailingSlash(url), postId);
  }
  return items.map((item) => {
    const originalUrl = originalUrlOf(item);
    return originalUrl === null ? item : { ...item, bridgedFromPostId: postIdByUrl.get(originalUrl) ?? null };
  });
};
