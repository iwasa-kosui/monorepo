import { MAX_DESCRIPTION_CHARS, MAX_TITLE_CHARS, type ParsedFeedItem } from '../adaptor/feed/parseFeed.ts';
import type { XApiClient, XPost } from '../adaptor/x/xApiClient.ts';
import type { FeedEntryMaxGuidResolverByFeedSourceId } from '../domain/feedEntry/feedEntry.ts';
import { FeedSource, type FeedSourceExternalUserIdResolvedStore } from '../domain/feedSource/feedSource.ts';
import { XUsername } from '../domain/feedSource/xUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { FeedItemFetcher } from './feedItemFetcher.ts';

export const X_USER_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Deps = Readonly<{
  xApiClient: XApiClient;
  feedEntryMaxGuidResolverByFeedSourceId: FeedEntryMaxGuidResolverByFeedSourceId;
  feedSourceExternalUserIdResolvedStore: FeedSourceExternalUserIdResolvedStore;
  now: () => Instant;
}>;

const truncate = (text: string, maxChars: number): string => Array.from(text).slice(0, maxChars).join('');

const decodeXText = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const toFeedItem = (username: XUsername, post: XPost): ParsedFeedItem => {
  const text = decodeXText(post.text).trim();
  return {
    guid: post.id,
    url: XUsername.toStatusUrl(username, post.id),
    title: truncate(text.replace(/\s+/g, ' '), MAX_TITLE_CHARS),
    description: truncate(text, MAX_DESCRIPTION_CHARS),
    publishedAt: post.createdAt,
    hatenaBookmarkCount: null,
  };
};

export const createXUserItemsFetcher = ({
  xApiClient,
  feedEntryMaxGuidResolverByFeedSourceId,
  feedSourceExternalUserIdResolvedStore,
  now,
}: Deps): FeedItemFetcher =>
async (source) => {
  const username = XUsername.fromProfileUrl(source.url);
  if (username === undefined) throw new Error(`The feed source URL is not an X profile: ${source.url}`);
  let resolved = source;
  let userId = source.externalUserId;
  if (userId === null) {
    const user = await xApiClient.lookupUserId(username);
    if (!user.ok) throw new Error(user.err.message);
    userId = user.val;
    const event = FeedSource.resolveExternalUserId(source, userId, now());
    await feedSourceExternalUserIdResolvedStore.store(event);
    resolved = event.aggregateState;
  }
  const maxGuid = (await feedEntryMaxGuidResolverByFeedSourceId.resolve(source.feedSourceId)).val;
  const posts = await xApiClient.fetchUserPosts(
    maxGuid === undefined
      ? { userId, startTime: Instant.addDuration(now(), -X_USER_RETENTION_DAYS * DAY_MS) }
      : { userId, sinceId: maxGuid },
  );
  if (!posts.ok) throw new Error(posts.err.message);
  return {
    source: resolved,
    items: posts.val.map((post) => toFeedItem(username, post)),
    retentionDays: X_USER_RETENTION_DAYS,
    validators: { etag: null, lastModified: null },
  };
};
