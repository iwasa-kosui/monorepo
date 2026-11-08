import { MAX_DESCRIPTION_CHARS, MAX_TITLE_CHARS, type ParsedFeedItem } from '../adaptor/feed/parseFeed.ts';
import type { Tweet, TwitterApiIoClient } from '../adaptor/twitterApiIo/twitterApiIoClient.ts';
import type { FeedEntryMaxGuidResolverByFeedSourceId } from '../domain/feedEntry/feedEntry.ts';
import { XUsername } from '../domain/feedSource/xUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { FeedItemFetcher } from './feedItemFetcher.ts';

export const X_USER_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Deps = Readonly<{
  twitterApiIoClient: TwitterApiIoClient;
  feedEntryMaxGuidResolverByFeedSourceId: FeedEntryMaxGuidResolverByFeedSourceId;
  now: () => Instant;
}>;

const truncate = (text: string, maxChars: number): string => Array.from(text).slice(0, maxChars).join('');

const decodeXText = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const toFeedItem = (username: XUsername, tweet: Tweet): ParsedFeedItem => {
  const text = decodeXText(tweet.text).trim();
  return {
    guid: tweet.id,
    url: XUsername.toStatusUrl(username, tweet.id),
    title: truncate(text.replace(/\s+/g, ' '), MAX_TITLE_CHARS),
    description: truncate(text, MAX_DESCRIPTION_CHARS),
    publishedAt: tweet.createdAt === null ? null : new Date(tweet.createdAt),
    hatenaBookmarkCount: null,
  };
};

export const createXUserItemsFetcher = ({
  twitterApiIoClient,
  feedEntryMaxGuidResolverByFeedSourceId,
  now,
}: Deps): FeedItemFetcher =>
async (source) => {
  const username = XUsername.fromProfileUrl(source.url);
  if (username === undefined) throw new Error(`The feed source URL is not an X profile: ${source.url}`);
  const maxGuid = (await feedEntryMaxGuidResolverByFeedSourceId.resolve(source.feedSourceId)).val;
  const tweets = await twitterApiIoClient.searchUserTweets(
    maxGuid === undefined
      ? { username, sinceTime: Instant.addDuration(now(), -X_USER_RETENTION_DAYS * DAY_MS) }
      : { username, sinceId: maxGuid },
  );
  if (!tweets.ok) throw new Error(tweets.err.message);
  return {
    source,
    items: tweets.val.map((tweet) => toFeedItem(username, tweet)),
    retentionDays: X_USER_RETENTION_DAYS,
    validators: { etag: null, lastModified: null },
  };
};
