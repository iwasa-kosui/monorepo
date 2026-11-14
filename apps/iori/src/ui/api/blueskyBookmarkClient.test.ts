import { describe, expect, it } from 'vitest';

import { blueskyBookmarkFailureMessage } from './blueskyBookmarkClient.ts';

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
