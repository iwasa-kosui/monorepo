import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyBookmarkFailureMessage,
  blueskyBookmarksLoadErrorMessage,
  bookmarkBlueskyPost,
  bookmarkBlueskyPostByUri,
  fetchBlueskyBookmarks,
  unbookmarkBlueskyPost,
  unbookmarkBlueskyPostByUri,
} from './blueskyBookmarkClient.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response) => {
  const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blueskyBookmarkClient の要求', () => {
  it('一覧を cursor つきで取り、cursor が無ければクエリを付けない', async () => {
    const withCursor = stubFetch(json({ items: [], cursor: null }));
    await fetchBlueskyBookmarks('abc def');
    expect(withCursor.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/bookmarks?cursor=abc+def');

    const withoutCursor = stubFetch(json({ items: [], cursor: null }));
    await fetchBlueskyBookmarks();
    expect(withoutCursor.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/bookmarks');
  });

  it('ブックマークは feedItemId を JSON で POST し、外すときは feedItemId をクエリにして DELETE する', async () => {
    const created = stubFetch(json({ bookmarked: true }));
    expect(await bookmarkBlueskyPost('at://x/app.bsky.feed.post/1#repost:did:plc:b')).toEqual({ bookmarked: true });
    expect(created.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/bookmarks');
    expect(created.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(created.mock.calls[0]?.[1]?.body as string)).toEqual({
      feedItemId: 'at://x/app.bsky.feed.post/1#repost:did:plc:b',
    });

    const deleted = stubFetch(json({ bookmarked: false }));
    expect(await unbookmarkBlueskyPost('at://x/app.bsky.feed.post/1')).toEqual({ bookmarked: false });
    expect(deleted.mock.calls[0]?.[0]).toBe(
      '/api/iori/v1/bluesky/bookmarks?feedItemId=at%3A%2F%2Fx%2Fapp.bsky.feed.post%2F1',
    );
    expect(deleted.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('uri の版は uri を本文とクエリに使う', async () => {
    const created = stubFetch(json({ bookmarked: true }));
    await bookmarkBlueskyPostByUri('at://x/app.bsky.feed.post/1');
    expect(JSON.parse(created.mock.calls[0]?.[1]?.body as string)).toEqual({ uri: 'at://x/app.bsky.feed.post/1' });

    const deleted = stubFetch(json({ bookmarked: false }));
    await unbookmarkBlueskyPostByUri('at://x/app.bsky.feed.post/1');
    expect(deleted.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/bookmarks?uri=at%3A%2F%2Fx%2Fapp.bsky.feed.post%2F1');
  });

  it('失敗した応答は status と error を持つエラーで投げる', async () => {
    stubFetch(json({ error: 'Bluesky bookmarks unavailable' }, 502));

    expect(await failure(bookmarkBlueskyPost('x'))).toMatchObject({
      message: 'Bluesky bookmarks unavailable',
      status: 502,
    });
  });
});

describe('blueskyBookmarkFailureMessage', () => {
  const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });

  it('ブックマークを使えないときは、アプリパスワードの案内にする', () => {
    expect(blueskyBookmarkFailureMessage('bookmark', apiError('Bluesky bookmarks unavailable', 502))).toBe(
      'Bluesky のブックマークを使えませんでした。アプリパスワードでは使えない可能性があります',
    );
  });

  it('ログイン切れは、既存の Bluesky の失敗の文言にする', () => {
    expect(blueskyBookmarkFailureMessage('bookmark', apiError('Bluesky login failed', 502))).toBe(
      'Bluesky にログインできないため、操作できませんでした。',
    );
  });

  it('409 は連携が無効という文言にする', () => {
    expect(blueskyBookmarkFailureMessage('bookmark', apiError('Bluesky timeline is disabled', 409))).toBe(
      'Bluesky 連携が無効です',
    );
  });

  it('それ以外は既存の失敗の文言にする', () => {
    expect(blueskyBookmarkFailureMessage('bookmark', apiError('Bluesky request failed', 502))).toBe(
      'Failed to bookmark: Bluesky request failed',
    );
    expect(blueskyBookmarkFailureMessage('bookmark', new TypeError('fetch failed'))).toBe(
      'Failed to bookmark. Please try again.',
    );
  });
});

describe('blueskyBookmarksLoadErrorMessage', () => {
  const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });

  it('使えない、ログイン切れ、連携が無効のときは、それぞれの文言にする', () => {
    expect(blueskyBookmarksLoadErrorMessage(apiError('Bluesky bookmarks unavailable', 502))).toBe(
      'Bluesky のブックマークを使えませんでした。アプリパスワードでは使えない可能性があります',
    );
    expect(blueskyBookmarksLoadErrorMessage(apiError('Bluesky login failed', 502))).toBe(
      'Bluesky にログインできないため、操作できませんでした。',
    );
    expect(blueskyBookmarksLoadErrorMessage(apiError('Bluesky timeline is disabled', 409))).toBe(
      'Bluesky 連携が無効です',
    );
  });

  it('それ以外と通信の失敗は、読み込めなかったという文言にする', () => {
    expect(blueskyBookmarksLoadErrorMessage(apiError('Bluesky request failed', 502))).toBe(
      'Bluesky のブックマークを読み込めませんでした',
    );
    expect(blueskyBookmarksLoadErrorMessage(new TypeError('fetch failed'))).toBe(
      'Bluesky のブックマークを読み込めませんでした',
    );
  });
});
