import { Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { XUsername } from '../../../domain/feedSource/xUsername.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../http/safeFetch.ts';
import { createTwitterApiIoClient, MAX_PAGES, REQUEST_INTERVAL_MS } from '../twitterApiIoClient.ts';

type Response = Result<SafeFetchResult, SafeFetchError>;

const ok = (body: unknown): Response =>
  Result.ok({
    status: 200,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    etag: null,
    lastModified: null,
    finalUrl: 'https://api.twitterapi.io/',
  });

const httpError = (status: number): Response =>
  Result.err({ type: 'SafeFetchError', reason: 'http_status', message: `Unexpected status ${status}.`, status });

const tweet = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'tweet',
  id,
  url: `https://x.com/jack/status/${id}`,
  text: `text ${id}`,
  createdAt: 'Tue Dec 10 07:00:30 +0000 2024',
  isReply: false,
  retweeted_tweet: null,
  quoted_tweet: null,
  author: { userName: 'jack' },
  ...extra,
});

const page = (tweets: ReadonlyArray<unknown>, nextCursor = '') => ({
  tweets,
  has_next_page: nextCursor !== '',
  next_cursor: nextCursor,
});

const setup = (...responses: Response[]) => {
  const queue = [...responses];
  const fetchText = vi.fn<SafeFetcher['fetchText']>(async () => queue.shift() ?? httpError(500));
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    sleeps.push(ms);
    clock += ms;
  });
  const client = createTwitterApiIoClient({
    safeFetcher: { fetchText },
    apiKey: 'secret-api-key',
    sleep,
    now: () => clock as Instant,
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  const calledUrl = (index = 0) => new URL(fetchText.mock.calls[index]![0]);
  return { client, fetchText, calledUrl, sleeps, advance };
};

const jack = XUsername.orThrow('jack');

describe('TwitterApiIoClient.searchUserTweets', () => {
  it('advanced_search を X-API-Key 付きで呼び、sinceId があれば since_id を query に足す', async () => {
    const { client, fetchText, calledUrl } = setup(ok(page([tweet('30'), tweet('20')])));

    const result = await client.searchUserTweets({ username: jack, sinceId: '10' });

    const url = calledUrl();
    expect(url.origin + url.pathname).toBe('https://api.twitterapi.io/twitter/tweet/advanced_search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: 'from:jack -filter:replies since_id:10',
      queryType: 'Latest',
      cursor: '',
    });
    expect(fetchText).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'secret-api-key' }) }),
    );
    expect(result).toEqual({
      ok: true,
      val: [
        { id: '30', text: 'text 30', createdAt: Date.UTC(2024, 11, 10, 7, 0, 30) },
        { id: '20', text: 'text 20', createdAt: Date.UTC(2024, 11, 10, 7, 0, 30) },
      ],
    });
  });

  it('sinceTime は秒単位に切り捨てて since_time を query に足す', async () => {
    const { client, calledUrl } = setup(ok(page([])));

    await client.searchUserTweets({ username: jack, sinceTime: Instant.orThrow(Date.UTC(2026, 10, 1, 2, 3, 4, 567)) });

    expect(calledUrl().searchParams.get('query')).toBe(
      `from:jack -filter:replies since_time:${Date.UTC(2026, 10, 1, 2, 3, 4) / 1000}`,
    );
  });

  it('リポストと返信を捨て、引用は残す', async () => {
    const { client } = setup(ok(page([
      tweet('50'),
      tweet('40', { retweeted_tweet: tweet('1') }),
      tweet('30', { isReply: true }),
      tweet('20', { quoted_tweet: tweet('2') }),
    ])));

    const result = await client.searchUserTweets({ username: jack, sinceId: '10' });

    expect(result.ok && result.val.map((item) => item.id)).toEqual(['50', '20']);
  });

  it('未知のキーがあっても、isReply と retweeted_tweet がなくても失敗しない', async () => {
    const { id, text, createdAt } = tweet('60');
    const { client } = setup(ok({ tweets: [{ id, text, createdAt, unknown: { nested: true } }], extra: 1 }));

    const result = await client.searchUserTweets({ username: jack, sinceId: '10' });

    expect(result.ok && result.val.map((item) => item.id)).toEqual(['60']);
  });

  it('has_next_page が true で next_cursor があれば、cursor を渡して次のページも取る', async () => {
    const { client, fetchText, calledUrl } = setup(
      ok(page([tweet('30')], 'cursor-1')),
      ok(page([tweet('20')], 'cursor-2')),
      ok(page([tweet('10')])),
    );

    const result = await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(fetchText).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((index) => calledUrl(index).searchParams.get('cursor'))).toEqual(['', 'cursor-1', 'cursor-2']);
    expect(result.ok && result.val.map((item) => item.id)).toEqual(['30', '20', '10']);
  });

  it(`${MAX_PAGES} ページで打ち切り、それまでに取れた投稿を返す`, async () => {
    const { client, fetchText } = setup(
      ...Array.from({ length: MAX_PAGES + 2 }, (_, index) => ok(page([tweet(String(100 - index))], `cursor-${index}`))),
    );

    const result = await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(fetchText).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result.ok && result.val).toHaveLength(MAX_PAGES);
  });

  it('createdAt が読めない投稿は createdAt を null にして残す', async () => {
    const { client } = setup(ok(page([tweet('70', { createdAt: 'yesterday' })])));

    expect(await client.searchUserTweets({ username: jack, sinceId: '1' })).toEqual({
      ok: true,
      val: [{ id: '70', text: 'text 70', createdAt: null }],
    });
  });

  it('途中のページが失敗したら、取れたページを捨てて全体を失敗にする', async () => {
    const { client } = setup(ok(page([tweet('30')], 'cursor-1')), httpError(429));

    expect(await client.searchUserTweets({ username: jack, sinceId: '1' })).toMatchObject({
      ok: false,
      err: { type: 'TwitterApiIoError', status: 429 },
    });
  });

  it('JSON でない本文を TwitterApiIoError にする', async () => {
    const { client } = setup(ok('<html></html>'));

    expect(await client.searchUserTweets({ username: jack, sinceId: '1' })).toEqual({
      ok: false,
      err: { type: 'TwitterApiIoError', message: 'twitterapi.io returned a body that is not JSON.' },
    });
  });

  it('形が違う応答を TwitterApiIoError にし、本文を message に含めない', async () => {
    const { client } = setup(
      ok({ error: 400, message: 'secret-detail', tweets: [{ id: 'abc', text: 'private text' }] }),
    );

    const result = await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(result).toEqual({
      ok: false,
      err: { type: 'TwitterApiIoError', message: 'twitterapi.io returned an unexpected response.' },
    });
  });

  it('リダイレクトを辿らない設定で呼ぶ', async () => {
    const { client, fetchText } = setup(ok(page([])));

    await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(fetchText).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxRedirects: 0 }));
  });

  it('古い投稿が混ざったページでは、古い投稿を捨てて次のページを取らない', async () => {
    const { client, fetchText } = setup(
      ok(page([tweet('30'), tweet('10'), tweet('5')], 'cursor-1')),
      ok(page([tweet('4')])),
    );

    const result = await client.searchUserTweets({ username: jack, sinceId: '10' });

    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(result.ok && result.val.map((item) => item.id)).toEqual(['30']);
  });

  it('sinceTime のときは id で投稿を捨てない', async () => {
    const { client } = setup(ok(page([tweet('30'), tweet('5')])));

    const result = await client.searchUserTweets({ username: jack, sinceTime: Instant.orThrow(1_700_000_000_000) });

    expect(result.ok && result.val.map((item) => item.id)).toEqual(['30', '5']);
  });

  it('1回目のリクエストの前には待たず、ページ送りでは前回から間隔をあける', async () => {
    const { client, sleeps } = setup(
      ok(page([tweet('30')], 'cursor-1')),
      ok(page([tweet('20')], 'cursor-2')),
      ok(page([tweet('10')])),
    );

    await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(sleeps).toEqual([REQUEST_INTERVAL_MS, REQUEST_INTERVAL_MS]);
  });

  it('呼び出しをまたいでも前回のリクエストから間隔をあけ、経過した分は待たない', async () => {
    const { client, sleeps, advance } = setup(ok(page([])), ok(page([])), ok(page([])));

    await client.searchUserTweets({ username: jack, sinceId: '1' });
    advance(2_000);
    await client.searchUserTweets({ username: jack, sinceId: '1' });
    advance(REQUEST_INTERVAL_MS);
    await client.searchUserTweets({ username: jack, sinceId: '1' });

    expect(sleeps).toEqual([REQUEST_INTERVAL_MS - 2_000]);
  });
});
