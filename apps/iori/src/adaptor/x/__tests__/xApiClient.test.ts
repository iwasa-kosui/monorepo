import { Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { XUsername } from '../../../domain/feedSource/xUsername.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../http/safeFetch.ts';
import { createXApiClient } from '../xApiClient.ts';

const ok = (body: unknown): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({
    status: 200,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    etag: null,
    lastModified: null,
    finalUrl: 'https://api.x.com/2/',
  });

const httpError = (status: number): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'http_status', message: `Unexpected status ${status}.`, status });

const setup = (response: Result<SafeFetchResult, SafeFetchError>) => {
  const fetchText = vi.fn<SafeFetcher['fetchText']>(async () => response);
  const client = createXApiClient({ safeFetcher: { fetchText }, bearerToken: 'bearer-token' });
  const calledUrl = () => new URL(fetchText.mock.calls[0]![0]);
  return { client, fetchText, calledUrl };
};

describe('XApiClient.lookupUserId', () => {
  it('GET /2/users/by/username/:username を Bearer トークン付きで呼び、数値の ID を返す', async () => {
    const { client, fetchText, calledUrl } = setup(ok({ data: { id: '12', username: 'jack', name: 'jack' } }));

    const result = await client.lookupUserId(XUsername.orThrow('jack'));

    expect(result).toEqual({ ok: true, val: '12' });
    expect(calledUrl().href).toBe('https://api.x.com/2/users/by/username/jack');
    expect(fetchText).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer bearer-token' }) }),
    );
  });

  it('data がない応答（ユーザーが存在しない）を XApiError にする', async () => {
    const { client } = setup(ok({ errors: [{ title: 'Not Found Error' }] }));

    expect(await client.lookupUserId(XUsername.orThrow('nobody'))).toMatchObject({
      ok: false,
      err: { type: 'XApiError' },
    });
  });

  it('JSON でない本文を XApiError にする', async () => {
    const { client } = setup(ok('<html></html>'));

    expect(await client.lookupUserId(XUsername.orThrow('jack'))).toMatchObject({
      ok: false,
      err: { type: 'XApiError', message: 'X API returned a body that is not JSON.' },
    });
  });

  it('429 を XApiError にして status を残す', async () => {
    const { client } = setup(httpError(429));

    expect(await client.lookupUserId(XUsername.orThrow('jack'))).toMatchObject({
      ok: false,
      err: { type: 'XApiError', message: expect.stringContaining('429'), status: 429 },
    });
  });
});

describe('XApiClient.fetchUserPosts', () => {
  const posts = {
    data: [
      { id: '30', text: 'newer', created_at: '2026-11-08T01:00:00.000Z', edit_history_tweet_ids: ['30'] },
      { id: '20', text: 'older', created_at: '2026-11-07T01:00:00.000Z', edit_history_tweet_ids: ['20'] },
    ],
    meta: { result_count: 2 },
  };

  it('since_id があれば max_results・exclude・tweet.fields とともに渡し、start_time は渡さない', async () => {
    const { client, calledUrl } = setup(ok(posts));

    const result = await client.fetchUserPosts({
      userId: '12',
      sinceId: '10',
      startTime: Instant.orThrow(Date.UTC(2026, 10, 1)),
    });

    const url = calledUrl();
    expect(url.origin + url.pathname).toBe('https://api.x.com/2/users/12/tweets');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      max_results: '100',
      exclude: 'replies,retweets',
      'tweet.fields': 'created_at',
      since_id: '10',
    });
    expect(result).toEqual({
      ok: true,
      val: [
        { id: '30', text: 'newer', createdAt: new Date('2026-11-08T01:00:00.000Z') },
        { id: '20', text: 'older', createdAt: new Date('2026-11-07T01:00:00.000Z') },
      ],
    });
  });

  it('since_id がなければ start_time を秒単位の UTC で渡す', async () => {
    const { client, calledUrl } = setup(ok(posts));

    await client.fetchUserPosts({ userId: '12', startTime: Instant.orThrow(Date.UTC(2026, 10, 1, 2, 3, 4, 567)) });

    expect(calledUrl().searchParams.get('start_time')).toBe('2026-11-01T02:03:04Z');
    expect(calledUrl().searchParams.has('since_id')).toBe(false);
  });

  it('data がない応答（新しい投稿がない）は空にする', async () => {
    const { client } = setup(ok({ meta: { result_count: 0 } }));

    expect(await client.fetchUserPosts({ userId: '12', sinceId: '30' })).toEqual({ ok: true, val: [] });
  });

  it('id が数値でない、または created_at がない投稿を含む応答を XApiError にする', async () => {
    const { client } = setup(ok({ data: [{ id: 'abc', text: 'x' }] }));

    expect(await client.fetchUserPosts({ userId: '12', sinceId: '30' })).toMatchObject({
      ok: false,
      err: { type: 'XApiError' },
    });
  });

  it('リダイレクトを辿らない設定で呼ぶ', async () => {
    const { client, fetchText } = setup(ok(posts));

    await client.fetchUserPosts({ userId: '12', sinceId: '10' });

    expect(fetchText).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxRedirects: 0 }));
  });
});
