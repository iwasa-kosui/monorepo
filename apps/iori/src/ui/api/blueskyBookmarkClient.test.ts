import { afterEach, describe, expect, it, vi } from 'vitest';

import { blueskyBookmarkFailureMessage, bookmarkBlueskyPost } from './blueskyBookmarkClient.ts';

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
