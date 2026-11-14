import { afterEach, describe, expect, it, vi } from 'vitest';

import { blueskyModerationFailureMessage, muteBlueskyActor, muteBlueskyThread } from './blueskyModerationClient.ts';

const DID = 'did:plc:target';
const ROOT = 'at://did:plc:target/app.bsky.feed.post/3kroot';
const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Bluesky のミュート、ブロック、通報の API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('失敗の文言は、ログイン失敗なら共通の文言、それ以外は操作ごとの文言にする', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await muteBlueskyActor(DID).catch((error: unknown) => error);
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await muteBlueskyActor(DID).catch((error: unknown) => error);

    for (const action of ['mute', 'muteThread', 'block', 'report'] as const) {
      expect(blueskyModerationFailureMessage(action, login)).toBe(
        'Bluesky にログインできないため、操作できませんでした。',
      );
    }
    expect(blueskyModerationFailureMessage('mute', other)).toBe('ミュートを変更できませんでした');
    expect(blueskyModerationFailureMessage('muteThread', other)).toBe('スレッドのミュートを変更できませんでした');
    expect(blueskyModerationFailureMessage('block', other)).toBe('ブロックを変更できませんでした');
    expect(blueskyModerationFailureMessage('report', other)).toBe('通報できませんでした');
    expect(blueskyModerationFailureMessage('report', new Error('Bluesky login failed'))).toBe('通報できませんでした');
  });

  it('スレッドのミュートが 404 なら、投稿が見つからない文言にする。ほかの操作と認証切れは変えない', async () => {
    stubFetch(json({ error: 'Bluesky post not found' }, 404));
    const notFound = await muteBlueskyThread(ROOT).catch((error: unknown) => error);
    stubFetch(json({ error: 'Bluesky login failed' }, 404));
    const login = await muteBlueskyThread(ROOT).catch((error: unknown) => error);

    expect(blueskyModerationFailureMessage('muteThread', notFound)).toBe(
      '投稿が見つからないため、スレッドのミュートを変更できませんでした',
    );
    expect(blueskyModerationFailureMessage('mute', notFound)).toBe('ミュートを変更できませんでした');
    expect(blueskyModerationFailureMessage('muteThread', login)).toBe(
      'Bluesky にログインできないため、操作できませんでした。',
    );
  });
});
