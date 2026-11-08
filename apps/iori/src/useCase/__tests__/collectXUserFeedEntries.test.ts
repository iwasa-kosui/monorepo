import type { D1Database } from '@cloudflare/workers-types';
import { Result } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1Db } from '../../adaptor/d1/client.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntriesResolverByFetchedBefore } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFetchedBefore.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { createD1FeedEntryCollectedStore } from '../../adaptor/d1/feedEntry/feedEntryCollectedStore.ts';
import { createD1FeedEntryExpiredStore } from '../../adaptor/d1/feedEntry/feedEntryExpiredStore.ts';
import { createD1FeedEntryMaxGuidResolverByFeedSourceId } from '../../adaptor/d1/feedEntry/feedEntryMaxGuidResolverByFeedSourceId.ts';
import { createD1AllFeedSourcesResolver } from '../../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceFetchedStore } from '../../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { domainEventsTable, feedEntriesTable, feedSourcesTable } from '../../adaptor/d1/schema.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { createTwitterApiIoClient } from '../../adaptor/twitterApiIo/twitterApiIoClient.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { AddFeedSourceUseCase } from '../addFeedSource.ts';
import { CollectFeedEntriesUseCase } from '../collectFeedEntries.ts';
import { X_USER_RETENTION_DAYS } from '../fetchXUserItems.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const DAY = 24 * 60 * 60 * 1000;
const FEED_URL = 'https://example.com/feed.xml';

const ok = (body: unknown): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({
    status: 200,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    etag: null,
    lastModified: null,
    finalUrl: 'https://api.twitterapi.io/',
  });

const failed = (status: number): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'http_status', message: `Unexpected status ${status}.`, status });

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const classicDate = (time: number): string => {
  const date = new Date(time);
  const [hh, mm, ss] = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map((value) =>
    String(value).padStart(2, '0')
  );
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${WEEKDAYS[date.getUTCDay()]} ${
    MONTHS[date.getUTCMonth()]
  } ${day} ${hh}:${mm}:${ss} +0000 ${date.getUTCFullYear()}`;
};

const tweet = (id: string, text: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
  type: 'tweet',
  id,
  url: `https://x.com/jack/status/${id}`,
  text,
  createdAt: classicDate(createdAt),
  isReply: false,
  retweeted_tweet: null,
  quoted_tweet: null,
  author: { userName: 'jack' },
  ...extra,
});

const searchPage = (tweets: ReadonlyArray<unknown>, nextCursor = '') => ({
  tweets,
  has_next_page: nextCursor !== '',
  next_cursor: nextCursor,
});

const createSerializedDb = () => {
  const { binding } = createSqliteD1Fixture();
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = {
    prepare: binding.prepare.bind(binding),
    batch: (statements: Parameters<D1Database['batch']>[0]) => {
      const run = tail.then(() => binding.batch(statements));
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return createD1Db(serialized as unknown as D1Database);
};

const setup = (
  fetchText: SafeFetcher['fetchText'],
  { apiKey = 'api-key', now = () => NOW }: { apiKey?: string | null; now?: () => Instant } = {},
) => {
  const db = createSerializedDb();
  const allFeedSourcesResolver = createD1AllFeedSourcesResolver(db);
  const feedSourceCreatedStore = createD1FeedSourceCreatedStore(db);
  const add = AddFeedSourceUseCase.create({ allFeedSourcesResolver, feedSourceCreatedStore, now });
  const collect = CollectFeedEntriesUseCase.create({
    feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
    feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
    feedEntriesResolverByFetchedBefore: createD1FeedEntriesResolverByFetchedBefore(db),
    feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
    feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
    feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
    feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
    feedEntryExpiredStore: createD1FeedEntryExpiredStore(db),
    feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
    safeFetcher: { fetchText },
    twitterApiIoClient: apiKey === null
      ? undefined
      : createTwitterApiIoClient({ safeFetcher: { fetchText }, apiKey, sleep: async () => {}, now }),
    now,
  });
  const addX = async (username = 'jack') => {
    const added = await add.run({ kind: 'x_user', username });
    if (!added.ok) throw new Error('unexpected');
    return added.val;
  };
  const sourceRow = async (url = 'https://x.com/jack') => {
    const [row] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, url));
    return row;
  };
  const eventNames = async () =>
    (await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable)).map((row) => row.name);
  return { db, add, addX, collect, sourceRow, eventNames };
};

const twitterApi = (response: () => unknown = () => searchPage([])) =>
  vi.fn<SafeFetcher['fetchText']>(async (url) =>
    new URL(url).pathname === '/twitter/tweet/advanced_search' ? ok(response()) : failed(404)
  );

const urlsOf = (fetchText: ReturnType<typeof twitterApi>) => fetchText.mock.calls.map(([url]) => new URL(url));

describe('AddFeedSourceUseCase の x_user', () => {
  it('https://x.com/<ユーザー名> の URL と @<ユーザー名> の title で情報源を保存する', async () => {
    const { addX, sourceRow, eventNames } = setup(twitterApi());

    const source = await addX('Kosui_Iwasa');

    expect(source).toMatchObject({ kind: 'x_user', url: 'https://x.com/kosui_iwasa' });
    expect(await sourceRow('https://x.com/kosui_iwasa')).toMatchObject({
      kind: 'x_user',
      title: '@Kosui_Iwasa',
      enabled: true,
    });
    expect(await eventNames()).toEqual(['feedSource.created']);
  });

  it('同じユーザーを大文字小文字違いで追加すると FeedSourceAlreadyExistsError にする', async () => {
    const { add, addX } = setup(twitterApi());
    await addX('Jack');

    expect(await add.run({ kind: 'x_user', username: 'jACK' })).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceAlreadyExistsError' },
    });
  });

  it('不正なユーザー名を ParseError にして、何も書かない', async () => {
    const { add, db } = setup(twitterApi());

    expect(await add.run({ kind: 'x_user', username: 'not valid' })).toMatchObject({
      ok: false,
      err: { kind: 'ParseError' },
    });
    expect(await db.select().from(feedSourcesTable)).toEqual([]);
  });
});

describe('CollectFeedEntriesUseCase の x_user', () => {
  it('TWITTERAPI_IO_API_KEY が無ければ API を呼ばず、lastError にも書かない', async () => {
    const fetchText = twitterApi();
    const { addX, collect, sourceRow, eventNames } = setup(fetchText, { apiKey: null });
    await addX();

    const result = await collect.run();

    expect(result.val).toEqual({ sources: 0, failed: 0, collected: 0, expired: 0 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(await sourceRow()).toMatchObject({ lastError: null, lastFetchedAt: null });
    expect(await eventNames()).toEqual(['feedSource.created']);
  });

  it('無効にした情報源は取得しない', async () => {
    const fetchText = twitterApi();
    const { addX, collect, db } = setup(fetchText);
    const source = await addX();
    await db.update(feedSourcesTable).set({ enabled: false }).where(
      eq(feedSourcesTable.feedSourceId, source.feedSourceId),
    );

    await collect.run();

    expect(fetchText).not.toHaveBeenCalled();
  });

  it('保存済みの投稿が無ければ、since_time を「いま − 保存期間」の unix 秒にして 1 回で取得する', async () => {
    const fetchText = twitterApi(() => searchPage([tweet('200', 'hello', NOW - DAY)]));
    const { addX, collect, sourceRow, eventNames } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toEqual({ sources: 1, failed: 0, collected: 1, expired: 0 });
    const calls = urlsOf(fetchText);
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0]!.searchParams)).toEqual({
      query: `from:jack -filter:replies since_time:${(NOW - X_USER_RETENTION_DAYS * DAY) / 1000}`,
      queryType: 'Latest',
      cursor: '',
    });
    expect(await sourceRow()).toMatchObject({
      lastError: null,
      lastFetchedAt: new Date(NOW),
      etag: null,
      lastModified: null,
    });
    expect(await eventNames()).toEqual(['feedSource.created', 'feedEntry.collected', 'feedSource.fetched']);
  });

  it('API のレスポンスを guid・url・title・description・publishedAt に変換して feed_entries に保存する', async () => {
    const createdAt = NOW - 3 * 60 * 60 * 1000;
    const fetchText = twitterApi(() =>
      searchPage([tweet('1234567890123456789', 'AT&amp;T &lt;3\n  second line', createdAt)])
    );
    const { addX, collect, db } = setup(fetchText);
    await addX();

    await collect.run();

    expect(await db.select().from(feedEntriesTable)).toEqual([
      expect.objectContaining({
        guid: '1234567890123456789',
        url: 'https://x.com/jack/status/1234567890123456789',
        title: 'AT&T <3 second line',
        description: 'AT&T <3\n  second line',
        publishedAt: new Date(createdAt),
        hatenaBookmarkCount: null,
        fetchedAt: new Date(NOW),
      }),
    ]);
  });

  it('title と description を既存の上限（1000 文字）で切る', async () => {
    const fetchText = twitterApi(() => searchPage([tweet('300', 'あ'.repeat(1500), NOW - DAY)]));
    const { addX, collect, db } = setup(fetchText);
    await addX();

    await collect.run();

    const [row] = await db.select().from(feedEntriesTable);
    expect(Array.from(row!.title)).toHaveLength(1000);
    expect(Array.from(row!.description)).toHaveLength(1000);
  });

  it('2 回目以降は保存済みの最大の投稿 ID（桁数が違っても数値の最大）を since_id にして、since_time は渡さない', async () => {
    let tweets = [tweet('99', 'a', NOW - 2 * DAY), tweet('100', 'b', NOW - DAY)];
    const fetchText = twitterApi(() => searchPage(tweets));
    const { addX, collect } = setup(fetchText);
    await addX();
    await collect.run();
    fetchText.mockClear();
    tweets = [tweet('101', 'c', NOW - 1000)];

    const second = await collect.run();

    expect(second.val).toMatchObject({ collected: 1, failed: 0 });
    const calls = urlsOf(fetchText);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.searchParams.get('query')).toBe('from:jack -filter:replies since_id:100');
  });

  it('同じ投稿が再び返っても二重に保存しない', async () => {
    const fetchText = twitterApi(() => searchPage([tweet('100', 'b', NOW - DAY)]));
    const { addX, collect, db } = setup(fetchText);
    await addX();
    await collect.run();

    const second = await collect.run();

    expect(second.val).toMatchObject({ collected: 0 });
    expect(await db.select().from(feedEntriesTable)).toHaveLength(1);
  });

  it('保存期間より古い投稿は保存しない', async () => {
    const fetchText = twitterApi(() =>
      searchPage([tweet('400', 'recent', NOW - 6 * DAY), tweet('300', 'stale', NOW - 8 * DAY)])
    );
    const { addX, collect, db } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toMatchObject({ collected: 1 });
    expect((await db.select().from(feedEntriesTable)).map((row) => row.guid)).toEqual(['400']);
  });

  it('保存済みの投稿が無ければ、新しい投稿が無くても since_time で取得する', async () => {
    const fetchText = twitterApi();
    const { addX, collect } = setup(fetchText);
    await addX();
    await collect.run();
    fetchText.mockClear();

    await collect.run();

    expect(urlsOf(fetchText)[0]!.searchParams.get('query')).toContain('since_time:');
  });

  it('リポストと返信は保存せず、引用は本文だけ保存する', async () => {
    const fetchText = twitterApi(() =>
      searchPage([
        tweet('500', 'plain', NOW - DAY),
        tweet('510', 'RT @other: reposted', NOW - DAY, { retweeted_tweet: tweet('1', 'original', NOW - 2 * DAY) }),
        tweet('520', '@other reply', NOW - DAY, { isReply: true }),
        tweet('530', 'my comment', NOW - DAY, { quoted_tweet: tweet('2', 'quoted body', NOW - 2 * DAY) }),
      ])
    );
    const { addX, collect, db } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toMatchObject({ collected: 2 });
    expect((await db.select().from(feedEntriesTable)).map((row) => [row.guid, row.description]).sort()).toEqual([
      ['500', 'plain'],
      ['530', 'my comment'],
    ]);
  });

  it('createdAt が読めない投稿は、RSS の日付なしの項目と同じく publishedAt を null にして保存する', async () => {
    const fetchText = twitterApi(() => searchPage([tweet('600', 'no date', NOW, { createdAt: 'yesterday' })]));
    const { addX, collect, db } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toMatchObject({ failed: 0, collected: 1 });
    expect(await db.select().from(feedEntriesTable)).toEqual([
      expect.objectContaining({ guid: '600', publishedAt: null }),
    ]);
  });

  it('has_next_page が続く間は次のページを取り、5 ページで打ち切る', async () => {
    let call = 0;
    const fetchText = twitterApi(() => {
      call += 1;
      return searchPage([tweet(String(1000 - call), `post ${call}`, NOW - DAY)], `cursor-${call}`);
    });
    const { addX, collect, db } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toMatchObject({ failed: 0, collected: 5 });
    expect(urlsOf(fetchText).map((url) => url.searchParams.get('cursor'))).toEqual([
      '',
      'cursor-1',
      'cursor-2',
      'cursor-3',
      'cursor-4',
    ]);
    expect(await db.select().from(feedEntriesTable)).toHaveLength(5);
  });

  it.each([429, 402])('%s は lastError に残して失敗とし、他の情報源の取得を止めない', async (status) => {
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) => {
      if (url === FEED_URL) {
        return ok(
          '<rss version="2.0"><channel><item><title>t</title><link>https://example.com/1</link></item></channel></rss>',
        );
      }
      return failed(status);
    });
    const { add, addX, collect, sourceRow, eventNames } = setup(fetchText);
    await addX();
    await add.run({ kind: 'rss', url: FEED_URL, title: 'ブログ' });

    const result = await collect.run();

    expect(result.val).toMatchObject({ sources: 2, failed: 1, collected: 1 });
    expect(await sourceRow()).toMatchObject({
      lastError: `twitterapi.io request failed: Unexpected status ${status}.`,
      lastFetchedAt: new Date(NOW),
    });
    expect(await eventNames()).toContain('feedSource.fetchFailed');
  });

  it('JSON でない応答を lastError に残して失敗とする', async () => {
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async () => ok('<html></html>'));
    const { addX, collect, sourceRow } = setup(fetchText);
    await addX();

    expect((await collect.run()).val).toMatchObject({ failed: 1, collected: 0 });
    expect(await sourceRow()).toMatchObject({ lastError: 'twitterapi.io returned a body that is not JSON.' });
  });

  it('形が違う応答を lastError に残して失敗とし、API キーも応答の本文も lastError に入れない', async () => {
    const fetchText = twitterApi(() => ({
      error: 400,
      message: 'private-detail',
      tweets: [{ id: 'abc', text: 'private text' }],
    }));
    const { addX, collect, sourceRow } = setup(fetchText, { apiKey: 'private-api-key' });
    await addX();

    expect((await collect.run()).val).toMatchObject({ failed: 1, collected: 0 });
    const row = await sourceRow();
    expect(row).toMatchObject({ lastError: 'twitterapi.io returned an unexpected response.' });
    expect(row!.lastError).not.toMatch(/private/);
  });

  it('x_user の情報源は並列にせず順に取る', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok(searchPage([]));
    });
    const { addX, collect } = setup(fetchText);
    await Promise.all(['alice', 'bob', 'carol', 'dave', 'erin'].map((name) => addX(name)));

    const result = await collect.run();

    expect(result.val).toMatchObject({ sources: 5, failed: 0 });
    expect(fetchText).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBe(1);
  });

  it('投稿の本文もユーザー名も console に出さない', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined)
    );
    const fetchText = twitterApi(() => searchPage([tweet('700', 'private post body', NOW - DAY)]));
    const { addX, collect } = setup(fetchText);
    await addX('privateuser');
    await collect.run();
    fetchText.mockImplementation(async () => failed(429));
    await collect.run();

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toMatch(/private post body|privateuser/);
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('x_user の保存期間', () => {
  const rssBody =
    '<rss version="2.0"><channel><item><title>blog</title><link>https://example.com/blog</link></item></channel></rss>';

  it('7 日より古い投稿だけを期限切れにし、rss の記事は 90 日まで残す', async () => {
    let now = Instant.orThrow(NOW - 10 * DAY);
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) =>
      url === FEED_URL ? ok(rssBody) : ok(searchPage([tweet('800', 'old post', now - DAY)]))
    );
    const { add, addX, collect, db } = setup(fetchText, { now: () => now });
    await addX();
    await add.run({ kind: 'rss', url: FEED_URL, title: 'ブログ' });
    expect((await collect.run()).val).toMatchObject({ collected: 2, expired: 0 });
    fetchText.mockImplementation(async (url) => (url === FEED_URL ? ok(rssBody) : ok(searchPage([]))));

    now = NOW;
    const second = await collect.run();

    expect(second.val).toMatchObject({ expired: 1 });
    expect((await db.select().from(feedEntriesTable)).map((row) => row.guid)).toEqual(['https://example.com/blog']);
    expect(
      (await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable)).filter((event) =>
        event.name === 'feedEntry.expired'
      ),
    ).toHaveLength(1);
  });

  it('7 日以内の投稿は残す', async () => {
    const fetchText = twitterApi(() => searchPage([tweet('900', 'fresh', NOW - 6 * DAY)]));
    const { addX, collect, db } = setup(fetchText);
    await addX();

    expect((await collect.run()).val).toMatchObject({ collected: 1, expired: 0 });
    expect(await db.select().from(feedEntriesTable)).toHaveLength(1);
  });
});
