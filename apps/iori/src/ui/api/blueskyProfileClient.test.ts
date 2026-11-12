import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyActorOfPath,
  blueskyFeedNoticeMessage,
  blueskyFollowFailureMessage,
  blueskyProfileLoadFailureMessage,
  fetchBlueskyAuthorFeed,
  fetchBlueskyProfile,
  followBlueskyActor,
  unfollowBlueskyActor,
} from './blueskyProfileClient.ts';

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

describe('blueskyProfileClient', () => {
  it('プロフィールを actor をエンコードして取る', async () => {
    const fetchStub = stubFetch(json({ did: 'did:plc:alice' }));

    await fetchBlueskyProfile('did:plc:alice');

    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/did%3Aplc%3Aalice');
  });

  it('投稿の一覧を cursor つきで取り、cursor が無ければクエリを付けない', async () => {
    const withCursor = stubFetch(json({ items: [], cursor: null }));
    await fetchBlueskyAuthorFeed('alice.bsky.social', 'abc def');
    expect(withCursor.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/alice.bsky.social/feed?cursor=abc+def');

    const withoutCursor = stubFetch(json({ items: [], cursor: null }));
    await fetchBlueskyAuthorFeed('alice.bsky.social');
    expect(withoutCursor.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/alice.bsky.social/feed');
  });

  it('フォローは did を JSON で POST し、解除は did をクエリにして DELETE する', async () => {
    const followed = stubFetch(json({ following: true, followUri: 'at://x/app.bsky.graph.follow/1' }));
    expect(await followBlueskyActor('did:plc:alice')).toEqual({
      following: true,
      followUri: 'at://x/app.bsky.graph.follow/1',
    });
    expect(followed.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/follows');
    expect(followed.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(followed.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ did: 'did:plc:alice' }));

    const unfollowed = stubFetch(json({ following: false }));
    expect(await unfollowBlueskyActor('did:plc:alice')).toEqual({ following: false });
    expect(unfollowed.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/follows?did=did%3Aplc%3Aalice');
    expect(unfollowed.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('followUri があれば、フォローは body に、解除はクエリに載せる', async () => {
    const uri = 'at://did:plc:me/app.bsky.graph.follow/3k1';
    const followed = stubFetch(json({ following: true, followUri: uri }));
    await followBlueskyActor('did:plc:alice', uri);
    expect(followed.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ did: 'did:plc:alice', followUri: uri }));

    const unfollowed = stubFetch(json({ following: false }));
    await unfollowBlueskyActor('did:plc:alice', uri);
    expect(unfollowed.mock.calls[0]?.[0]).toBe(
      `/api/iori/v1/bluesky/follows?did=did%3Aplc%3Aalice&followUri=${encodeURIComponent(uri)}`,
    );
  });

  it('失敗した応答は status と error の文言を持つエラーにする', async () => {
    stubFetch(json({ error: 'Profile not found' }, 404));

    expect(await failure(fetchBlueskyProfile('x'))).toMatchObject({ status: 404, message: 'Profile not found' });
  });

  it('読み込み失敗の文言を、404 とそれ以外で分ける', async () => {
    stubFetch(json({ error: 'Profile not found' }, 404));
    const notFound = await failure(fetchBlueskyProfile('x'));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const bad = await failure(fetchBlueskyProfile('x'));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyProfile('x'));

    expect(blueskyProfileLoadFailureMessage(notFound)).toBe('この Bluesky のアカウントは見つかりません');
    expect(blueskyProfileLoadFailureMessage(disabled)).toBe('Bluesky の連携が無効です');
    expect(blueskyProfileLoadFailureMessage(bad)).toBe('プロフィールを読み込めませんでした');
    expect(blueskyProfileLoadFailureMessage(new Error('x'))).toBe('プロフィールを読み込めませんでした');
  });

  it('投稿の一覧の文言を、ブロック、取得の失敗、問題なしで分ける', () => {
    expect(blueskyFeedNoticeMessage({ unavailable: 'blocked', failed: false })).toBe(
      'ブロックしているか、ブロックされているため、投稿を表示できません',
    );
    expect(blueskyFeedNoticeMessage({ unavailable: null, failed: true })).toBe('投稿を読み込めませんでした');
    expect(blueskyFeedNoticeMessage({ unavailable: null, failed: false })).toBeNull();
  });

  it('フォロー・解除の失敗の文言を、ログイン失敗とそれ以外で分ける', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(followBlueskyActor('did:plc:alice'));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(unfollowBlueskyActor('did:plc:alice'));

    expect(blueskyFollowFailureMessage(login)).toBe('Bluesky にログインできないため、操作できませんでした。');
    expect(blueskyFollowFailureMessage(other)).toBe('フォローを変更できませんでした');
    expect(blueskyFollowFailureMessage(new Error('x'))).toBe('フォローを変更できませんでした');
  });
});

describe('blueskyActorOfPath', () => {
  it('パスの actor をデコードして返す', () => {
    expect(blueskyActorOfPath('/bluesky/profile/did%3Aplc%3Aalice')).toBe('did:plc:alice');
    expect(blueskyActorOfPath('/bluesky/profile/alice.bsky.social/')).toBe('alice.bsky.social');
  });

  it('actor が無い、またはデコードできないパスは undefined にする', () => {
    expect(blueskyActorOfPath('/bluesky/profile/')).toBeUndefined();
    expect(blueskyActorOfPath('/bluesky/profile/%E0%A4%A')).toBeUndefined();
    expect(blueskyActorOfPath('/remote-users/a1')).toBeUndefined();
  });
});
