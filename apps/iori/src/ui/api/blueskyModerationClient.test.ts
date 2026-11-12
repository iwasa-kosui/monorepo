import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blockBlueskyActor,
  blueskyModerationFailureMessage,
  fetchBlueskyModeration,
  muteBlueskyActor,
  muteBlueskyThread,
  reportBlueskyActor,
  unblockBlueskyActor,
  unmuteBlueskyActor,
  unmuteBlueskyThread,
} from './blueskyModerationClient.ts';

const DID = 'did:plc:target';
const ROOT = 'at://did:plc:target/app.bsky.feed.post/3kroot';
const BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kblock';

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const firstCall = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];

describe('Bluesky のミュート、ブロック、通報の API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchBlueskyModeration は DID をエンコードして GET し、状態を返す', async () => {
    const fetchMock = stubFetch(json({ muted: true, blockUri: BLOCK }));

    const result = await fetchBlueskyModeration(DID);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/moderation/did%3Aplc%3Atarget');
    expect(init.credentials).toBe('same-origin');
    expect(result).toEqual({ muted: true, blockUri: BLOCK });
  });

  it('muteBlueskyActor は did を JSON 本文で POST する', async () => {
    const fetchMock = stubFetch(json({ muted: true }));

    const result = await muteBlueskyActor(DID);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/mutes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ did: DID });
    expect(result).toEqual({ muted: true });
  });

  it('unmuteBlueskyActor は did をクエリにして DELETE する', async () => {
    const fetchMock = stubFetch(json({ muted: false }));

    const result = await unmuteBlueskyActor(DID);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/mutes?did=did%3Aplc%3Atarget');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ muted: false });
  });

  it('muteBlueskyThread は root を JSON 本文で POST する', async () => {
    const fetchMock = stubFetch(json({ threadMuted: true }));

    const result = await muteBlueskyThread(ROOT);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/thread-mutes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ root: ROOT });
    expect(result).toEqual({ threadMuted: true });
  });

  it('unmuteBlueskyThread は root をクエリにして DELETE する', async () => {
    const fetchMock = stubFetch(json({ threadMuted: false }));

    const result = await unmuteBlueskyThread(ROOT);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(
      '/api/iori/v1/bluesky/thread-mutes?root=at%3A%2F%2Fdid%3Aplc%3Atarget%2Fapp.bsky.feed.post%2F3kroot',
    );
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ threadMuted: false });
  });

  it('muteBlueskyThread は失敗した応答を status つきのエラーにする', async () => {
    stubFetch(json({ error: 'Bluesky request failed' }, 502));

    await expect(muteBlueskyThread(ROOT)).rejects.toMatchObject({ message: 'Bluesky request failed', status: 502 });
  });

  it('blockBlueskyActor は did を JSON 本文で POST する', async () => {
    const fetchMock = stubFetch(json({ blockUri: BLOCK }));

    const result = await blockBlueskyActor(DID);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/blocks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ did: DID });
    expect(result).toEqual({ blockUri: BLOCK });
  });

  it('unblockBlueskyActor は did と、あれば blockUri をクエリにして DELETE する', async () => {
    const withUri = stubFetch(json({ blockUri: null }));
    await unblockBlueskyActor(DID, BLOCK);
    const withoutUri = stubFetch(json({ blockUri: null }));
    await unblockBlueskyActor(DID);

    expect(firstCall(withUri)[0]).toBe(
      '/api/iori/v1/bluesky/blocks?did=did%3Aplc%3Atarget&blockUri=at%3A%2F%2Fdid%3Aplc%3Ame%2Fapp.bsky.graph.block%2F3kblock',
    );
    expect(firstCall(withUri)[1].method).toBe('DELETE');
    expect(firstCall(withoutUri)[0]).toBe('/api/iori/v1/bluesky/blocks?did=did%3Aplc%3Atarget');
  });

  it('reportBlueskyActor は did、category、comment を JSON 本文で POST する', async () => {
    const fetchMock = stubFetch(json({}, 201));

    await reportBlueskyActor({ did: DID, category: 'spam', comment: '宣伝' });

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/iori/v1/bluesky/reports');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ did: DID, category: 'spam', comment: '宣伝' });
  });

  it('失敗した応答は、サーバーの error を message にした status つきのエラーにする', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));

    await expect(muteBlueskyActor(DID)).rejects.toMatchObject({ message: 'Bluesky login failed', status: 502 });
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
      '投稿が見つからないため、スレッドをミュートできませんでした',
    );
    expect(blueskyModerationFailureMessage('mute', notFound)).toBe('ミュートを変更できませんでした');
    expect(blueskyModerationFailureMessage('muteThread', login)).toBe(
      'Bluesky にログインできないため、操作できませんでした。',
    );
  });
});
