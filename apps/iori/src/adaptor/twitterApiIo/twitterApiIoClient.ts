import { RA } from '@iwasa-kosui/result';
import { z } from 'zod/v4';

import type { XUsername } from '../../domain/feedSource/xUsername.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { SafeFetcher } from '../http/safeFetch.ts';
import { parseTweetCreatedAt } from './parseTweetCreatedAt.ts';

const SEARCH_URL = 'https://api.twitterapi.io/twitter/tweet/advanced_search';
export const MAX_PAGES = 5;
export const REQUEST_INTERVAL_MS = 5_000;
// リダイレクトを辿ると API キーが転送先にも送られるため、辿らない
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 0 } as const;

export type TwitterApiIoError = Readonly<{ type: 'TwitterApiIoError'; message: string; status?: number }>;

export type Tweet = Readonly<{ id: string; text: string; createdAt: Instant | null }>;

export type UserTweetsQuery =
  & Readonly<{ username: XUsername }>
  & (Readonly<{ sinceId: string }> | Readonly<{ sinceTime: Instant }>);

export type TwitterApiIoClient = Readonly<{
  searchUserTweets: (query: UserTweetsQuery) => RA<ReadonlyArray<Tweet>, TwitterApiIoError>;
}>;

const tweetZodType = z.object({
  id: z.string().regex(/^\d+$/),
  text: z.string(),
  createdAt: z.string().transform((value) => parseTweetCreatedAt(value) ?? null),
  isReply: z.boolean().nullish(),
  retweeted_tweet: z.unknown(),
});

const searchResponseZodType = z.object({
  tweets: z.array(tweetZodType),
  has_next_page: z.boolean().nullish(),
  next_cursor: z.string().nullish(),
});

type SearchResponse = z.output<typeof searchResponseZodType>;

const twitterApiIoError = (message: string, status?: number): TwitterApiIoError => ({
  type: 'TwitterApiIoError',
  message,
  ...(status === undefined ? {} : { status }),
});

const toQuery = (input: UserTweetsQuery): string => {
  const since = 'sinceId' in input ? `since_id:${input.sinceId}` : `since_time:${Math.floor(input.sinceTime / 1000)}`;
  return `from:${input.username} -filter:replies ${since}`;
};

const isOriginalPost = (tweet: SearchResponse['tweets'][number]): boolean =>
  tweet.isReply !== true && (tweet.retweeted_tweet === null || tweet.retweeted_tweet === undefined);

const isNumericId = (value: string): boolean => /^\d+$/.test(value);

type Deps = Readonly<{
  safeFetcher: SafeFetcher;
  apiKey: string;
  sleep: (ms: number) => Promise<void>;
  now: () => Instant;
}>;

export const createTwitterApiIoClient = ({ safeFetcher, apiKey, sleep, now }: Deps): TwitterApiIoClient => {
  let nextRequestAt: number | undefined;

  const waitForTurn = async (): Promise<void> => {
    const current = now();
    const startAt = nextRequestAt === undefined ? current : Math.max(current, nextRequestAt);
    nextRequestAt = startAt + REQUEST_INTERVAL_MS;
    if (startAt > current) await sleep(startAt - current);
  };

  const getPage = async (query: string, cursor: string): RA<SearchResponse, TwitterApiIoError> => {
    await waitForTurn();
    const url = new URL(SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('queryType', 'Latest');
    url.searchParams.set('cursor', cursor);
    const fetched = await safeFetcher.fetchText(url.href, {
      ...FETCH_OPTIONS,
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });
    if (!fetched.ok) {
      return RA.err(twitterApiIoError(`twitterapi.io request failed: ${fetched.err.message}`, fetched.err.status));
    }
    let json: unknown;
    try {
      json = JSON.parse(fetched.val.body ?? '');
    } catch {
      return RA.err(twitterApiIoError('twitterapi.io returned a body that is not JSON.'));
    }
    const parsed = searchResponseZodType.safeParse(json);
    return parsed.success
      ? RA.ok(parsed.data)
      : RA.err(twitterApiIoError('twitterapi.io returned an unexpected response.'));
  };

  const searchUserTweets: TwitterApiIoClient['searchUserTweets'] = async (input) => {
    const query = toQuery(input);
    const sinceId = 'sinceId' in input && isNumericId(input.sinceId) ? BigInt(input.sinceId) : undefined;
    const tweets: Tweet[] = [];
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await getPage(query, cursor);
      if (!response.ok) return response;
      // since_id が効かない場合に備え、sinceId 以前の投稿が出たらそれ以降のページを取らない
      const fresh = sinceId === undefined
        ? response.val.tweets
        : response.val.tweets.filter((tweet) => BigInt(tweet.id) > sinceId);
      for (const tweet of fresh) {
        if (isOriginalPost(tweet)) tweets.push({ id: tweet.id, text: tweet.text, createdAt: tweet.createdAt });
      }
      if (fresh.length < response.val.tweets.length) break;
      const nextCursor = response.val.next_cursor ?? '';
      if (response.val.has_next_page !== true || nextCursor === '') break;
      cursor = nextCursor;
    }
    return RA.ok(tweets);
  };

  return { searchUserTweets };
};
