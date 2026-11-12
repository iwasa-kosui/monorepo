import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { BlueskyTimelineItem } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { postsTable, remotePostsTable } from '../schema.ts';

const BRIDGY_AP_HANDLE_SUFFIX = '.ap.brid.gy';

const withoutTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

const hostnameOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const hasSameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

// Bridgy Fed は Fediverse の投稿を *.ap.brid.gy のアカウントで Bluesky に出し、元の投稿の url を bridgyOriginalUrl に入れる
const originalUrlOf = (item: BlueskyTimelineItem): string | null => {
  if (item.bridgyOriginalUrl === null) return null;
  const hostname = hostnameOf(item.bridgyOriginalUrl);
  if (hostname === null) return null;
  return item.authorHandle.toLowerCase().endsWith(`.${hostname}${BRIDGY_AP_HANDLE_SUFFIX}`)
    ? withoutTrailingSlash(item.bridgyOriginalUrl)
    : null;
};

const addPostId = (map: Map<string, Set<string>>, key: string, postId: string): void => {
  const postIds = map.get(key);
  if (postIds === undefined) map.set(key, new Set([postId]));
  else postIds.add(postId);
};

const onlyPostId = (postIds: ReadonlySet<string> | undefined): string | null =>
  postIds !== undefined && postIds.size === 1 ? [...postIds][0] : null;

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
    ));
  const postIdsByUri = new Map<string, Set<string>>();
  const postIdsByUrl = new Map<string, Set<string>>();
  for (const { postId, uri, url } of rows) {
    addPostId(postIdsByUri, withoutTrailingSlash(uri), postId);
    if (url !== null && hasSameOrigin(url, uri)) addPostId(postIdsByUrl, withoutTrailingSlash(url), postId);
  }
  return items.map((item) => {
    const originalUrl = originalUrlOf(item);
    if (originalUrl === null) return item;
    const byUri = postIdsByUri.get(originalUrl);
    const bridgedFromPostId = byUri !== undefined ? onlyPostId(byUri) : onlyPostId(postIdsByUrl.get(originalUrl));
    return { ...item, bridgedFromPostId };
  });
};
