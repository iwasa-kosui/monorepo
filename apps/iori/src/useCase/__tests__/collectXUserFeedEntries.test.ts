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
import { createD1FeedSourceExternalUserIdResolvedStore } from '../../adaptor/d1/feedSource/feedSourceExternalUserIdResolvedStore.ts';
import { createD1FeedSourceFetchedStore } from '../../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { domainEventsTable, feedEntriesTable, feedSourcesTable } from '../../adaptor/d1/schema.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { createXApiClient } from '../../adaptor/x/xApiClient.ts';
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
    finalUrl: 'https://api.x.com/2/',
  });

const failed = (status: number): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'http_status', message: `Unexpected status ${status}.`, status });

const post = (id: string, text: string, createdAt: number) => ({
  id,
  text,
  created_at: new Date(createdAt).toISOString(),
  edit_history_tweet_ids: [id],
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
  { bearerToken = 'bearer-token', now = () => NOW }: { bearerToken?: string | null; now?: () => Instant } = {},
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
    feedSourceExternalUserIdResolvedStore: createD1FeedSourceExternalUserIdResolvedStore(db),
    safeFetcher: { fetchText },
    xApiClient: bearerToken === null
      ? undefined
      : createXApiClient({ safeFetcher: { fetchText }, bearerToken }),
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

type XApiFixture = Readonly<{ lookup?: Result<SafeFetchResult, SafeFetchError>; posts?: () => unknown }>;

const xApi = ({ lookup = ok({ data: { id: '12', username: 'jack' } }), posts = () => ({}) }: XApiFixture = {}) =>
  vi.fn<SafeFetcher['fetchText']>(async (url) => {
    const { pathname } = new URL(url);
    if (pathname.startsWith('/2/users/by/username/')) return lookup;
    if (pathname === '/2/users/12/tweets') return ok(posts());
    return failed(404);
  });

const urlsOf = (fetchText: ReturnType<typeof xApi>) => fetchText.mock.calls.map(([url]) => new URL(url));

describe('AddFeedSourceUseCase の x_user', () => {
  it('https://x.com/<ユーザー名> の URL と @<ユーザー名> の title で、ユーザー ID が空の情報源を保存する', async () => {
    const { addX, sourceRow, eventNames } = setup(xApi());

    const source = await addX('Kosui_Iwasa');

    expect(source).toMatchObject({ kind: 'x_user', url: 'https://x.com/kosui_iwasa', externalUserId: null });
    expect(await sourceRow('https://x.com/kosui_iwasa')).toMatchObject({
      kind: 'x_user',
      title: '@Kosui_Iwasa',
      externalUserId: null,
      enabled: true,
    });
    expect(await eventNames()).toEqual(['feedSource.created']);
  });

  it('同じユーザーを大文字小文字違いで追加すると FeedSourceAlreadyExistsError にする', async () => {
    const { add, addX } = setup(xApi());
    await addX('Jack');

    expect(await add.run({ kind: 'x_user', username: 'jACK' })).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceAlreadyExistsError' },
    });
  });

  it('不正なユーザー名を ParseError にして、何も書かない', async () => {
    const { add, db } = setup(xApi());

    expect(await add.run({ kind: 'x_user', username: 'not valid' })).toMatchObject({
      ok: false,
      err: { kind: 'ParseError' },
    });
    expect(await db.select().from(feedSourcesTable)).toEqual([]);
  });
});

describe('CollectFeedEntriesUseCase の x_user', () => {
  it('X_API_BEARER_TOKEN が無ければ API を呼ばず、lastError にも書かない', async () => {
    const fetchText = xApi();
    const { addX, collect, sourceRow, eventNames } = setup(fetchText, { bearerToken: null });
    await addX();

    const result = await collect.run();

    expect(result.val).toEqual({ sources: 0, failed: 0, collected: 0, expired: 0 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(await sourceRow()).toMatchObject({ lastError: null, lastFetchedAt: null, externalUserId: null });
    expect(await eventNames()).toEqual(['feedSource.created']);
  });

  it('無効にした情報源は取得しない', async () => {
    const fetchText = xApi();
    const { addX, collect, db } = setup(fetchText);
    const source = await addX();
    await db.update(feedSourcesTable).set({ enabled: false }).where(
      eq(feedSourcesTable.feedSourceId, source.feedSourceId),
    );

    await collect.run();

    expect(fetchText).not.toHaveBeenCalled();
  });

  it('初回はユーザー ID を引いて保存し、start_time を「いま − 保存期間」にして取得する', async () => {
    const fetchText = xApi({
      posts: () => ({ data: [post('200', 'hello', NOW - DAY)], meta: { result_count: 1 } }),
    });
    const { addX, collect, sourceRow, eventNames } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toEqual({ sources: 1, failed: 0, collected: 1, expired: 0 });
    const [lookup, tweets] = urlsOf(fetchText);
    expect(lookup!.href).toBe('https://api.x.com/2/users/by/username/jack');
    expect(tweets!.pathname).toBe('/2/users/12/tweets');
    expect(tweets!.searchParams.get('start_time')).toBe(
      new Date(NOW - X_USER_RETENTION_DAYS * DAY).toISOString().replace('.000Z', 'Z'),
    );
    expect(tweets!.searchParams.has('since_id')).toBe(false);
    expect(await sourceRow()).toMatchObject({
      externalUserId: '12',
      lastError: null,
      lastFetchedAt: new Date(NOW),
      etag: null,
      lastModified: null,
    });
    expect(await eventNames()).toEqual([
      'feedSource.created',
      'feedSource.externalUserIdResolved',
      'feedEntry.collected',
      'feedSource.fetched',
    ]);
  });

  it('API のレスポンスを guid・url・title・description・publishedAt に変換して feed_entries に保存する', async () => {
    const createdAt = NOW - 3 * 60 * 60 * 1000;
    const fetchText = xApi({
      posts: () => ({
        data: [post('1234567890123456789', 'AT&amp;T &lt;3\n  second line', createdAt)],
        meta: { result_count: 1 },
      }),
    });
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
    const fetchText = xApi({
      posts: () => ({ data: [post('300', 'あ'.repeat(1500), NOW - DAY)] }),
    });
    const { addX, collect, db } = setup(fetchText);
    await addX();

    await collect.run();

    const [row] = await db.select().from(feedEntriesTable);
    expect(Array.from(row!.title)).toHaveLength(1000);
    expect(Array.from(row!.description)).toHaveLength(1000);
  });

  it('2 回目以降はユーザー ID を引き直さず、保存済みの最大の投稿 ID（桁数が違っても数値の最大）を since_id にする', async () => {
    let page = [post('99', 'a', NOW - 2 * DAY), post('100', 'b', NOW - DAY)];
    const fetchText = xApi({ posts: () => ({ data: page }) });
    const { addX, collect } = setup(fetchText);
    await addX();
    await collect.run();
    fetchText.mockClear();
    page = [post('101', 'c', NOW - 1000)];

    const second = await collect.run();

    expect(second.val).toMatchObject({ collected: 1, failed: 0 });
    const calls = urlsOf(fetchText);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.searchParams.get('since_id')).toBe('100');
    expect(calls[0]!.searchParams.has('start_time')).toBe(false);
  });

  it('同じ投稿が再び返っても二重に保存しない', async () => {
    const fetchText = xApi({ posts: () => ({ data: [post('100', 'b', NOW - DAY)] }) });
    const { addX, collect, db } = setup(fetchText);
    await addX();
    await collect.run();

    const second = await collect.run();

    expect(second.val).toMatchObject({ collected: 0 });
    expect(await db.select().from(feedEntriesTable)).toHaveLength(1);
  });

  it('保存期間より古い投稿は保存しない', async () => {
    const fetchText = xApi({
      posts: () => ({
        data: [post('400', 'recent', NOW - 6 * DAY), post('300', 'stale', NOW - 8 * DAY)],
      }),
    });
    const { addX, collect, db } = setup(fetchText);
    await addX();

    const result = await collect.run();

    expect(result.val).toMatchObject({ collected: 1 });
    expect((await db.select().from(feedEntriesTable)).map((row) => row.guid)).toEqual(['400']);
  });

  it('保存済みの投稿が無ければ、新しい投稿が無くても start_time で取得する', async () => {
    const fetchText = xApi({ posts: () => ({ meta: { result_count: 0 } }) });
    const { addX, collect } = setup(fetchText);
    await addX();
    await collect.run();
    fetchText.mockClear();

    await collect.run();

    const [tweets] = urlsOf(fetchText);
    expect(tweets!.searchParams.has('start_time')).toBe(true);
  });

  it('429 は lastError に残して失敗とし、他の情報源の取得を止めない', async () => {
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) => {
      if (url === FEED_URL) {
        return ok(
          '<rss version="2.0"><channel><item><title>t</title><link>https://example.com/1</link></item></channel></rss>',
        );
      }
      return failed(429);
    });
    const { add, addX, collect, sourceRow, eventNames } = setup(fetchText);
    await addX();
    await add.run({ kind: 'rss', url: FEED_URL, title: 'ブログ' });

    const result = await collect.run();

    expect(result.val).toMatchObject({ sources: 2, failed: 1, collected: 1 });
    expect(await sourceRow()).toMatchObject({
      lastError: expect.stringContaining('429'),
      externalUserId: null,
      lastFetchedAt: new Date(NOW),
    });
    expect(await eventNames()).toContain('feedSource.fetchFailed');
    expect(await eventNames()).not.toContain('feedSource.externalUserIdResolved');
  });

  it('ユーザー ID を引けたあとの取得失敗でも、ユーザー ID は残して次の取得で引き直さない', async () => {
    let failing = true;
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) => {
      const { pathname } = new URL(url);
      if (pathname.startsWith('/2/users/by/username/')) return ok({ data: { id: '12' } });
      return failing ? failed(429) : ok({ data: [post('500', 'x', NOW - DAY)] });
    });
    const { addX, collect, sourceRow } = setup(fetchText);
    await addX();
    expect((await collect.run()).val).toMatchObject({ failed: 1 });
    expect(await sourceRow()).toMatchObject({ externalUserId: '12', lastError: expect.stringContaining('429') });
    fetchText.mockClear();
    failing = false;

    expect((await collect.run()).val).toMatchObject({ failed: 0, collected: 1 });

    expect(fetchText.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/2/users/12/tweets']);
    expect(await sourceRow()).toMatchObject({ externalUserId: '12', lastError: null });
  });

  it('JSON でない応答を lastError に残して失敗とする', async () => {
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async () => ok('<html></html>'));
    const { addX, collect, sourceRow } = setup(fetchText);
    await addX();

    expect((await collect.run()).val).toMatchObject({ failed: 1, collected: 0 });
    expect(await sourceRow()).toMatchObject({ lastError: 'X API returned a body that is not JSON.' });
  });

  it('ユーザーが存在しない応答を lastError に残して失敗とする', async () => {
    const fetchText = xApi({ lookup: ok({ errors: [{ title: 'Not Found Error' }] }) });
    const { addX, collect, sourceRow } = setup(fetchText);
    await addX();

    expect((await collect.run()).val).toMatchObject({ failed: 1, collected: 0 });
    expect(await sourceRow()).toMatchObject({ externalUserId: null, lastError: expect.stringContaining('unexpected') });
  });
});

describe('x_user の保存期間', () => {
  const rssBody =
    '<rss version="2.0"><channel><item><title>blog</title><link>https://example.com/blog</link></item></channel></rss>';

  it('7 日より古い投稿だけを期限切れにし、rss の記事は 90 日まで残す', async () => {
    let now = Instant.orThrow(NOW - 10 * DAY);
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) => {
      const { pathname } = new URL(url);
      if (url === FEED_URL) return ok(rssBody);
      if (pathname.startsWith('/2/users/by/username/')) return ok({ data: { id: '12' } });
      return ok({ data: [post('600', 'old post', now - DAY)] });
    });
    const { add, addX, collect, db } = setup(fetchText, { now: () => now });
    await addX();
    await add.run({ kind: 'rss', url: FEED_URL, title: 'ブログ' });
    expect((await collect.run()).val).toMatchObject({ collected: 2, expired: 0 });
    fetchText.mockImplementation(async (url) => (url === FEED_URL ? ok(rssBody) : ok({})));

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
    const fetchText = xApi({ posts: () => ({ data: [post('700', 'fresh', NOW - 6 * DAY)] }) });
    const { addX, collect, db } = setup(fetchText);
    await addX();

    expect((await collect.run()).val).toMatchObject({ collected: 1, expired: 0 });
    expect(await db.select().from(feedEntriesTable)).toHaveLength(1);
  });
});
