import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyActorOfPath,
  blueskyFeedNoticeMessage,
  blueskyFollowFailureMessage,
  blueskyFollowListFailureMessage,
  blueskyLikedPostsFailureMessage,
  blueskyProfileLoadFailureMessage,
  fetchBlueskyAuthorFeed,
  fetchBlueskyFollowers,
  fetchBlueskyFollows,
  fetchBlueskyLikedPosts,
  fetchBlueskyProfile,
  fetchOwnBlueskyProfile,
  followBlueskyActor,
  ownBlueskyProfileSaveFailureMessage,
  unfollowBlueskyActor,
  updateOwnBlueskyProfile,
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

  it('フォロー一覧とフォロワー一覧を actor をエンコードして取り、cursor が無ければクエリを付けない', async () => {
    const page = { actors: [], cursor: null, viewerDid: 'did:plc:me' };

    const follows = stubFetch(json(page));
    expect(await fetchBlueskyFollows('did:plc:alice')).toEqual(page);
    expect(follows.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/did%3Aplc%3Aalice/follows');

    const followers = stubFetch(json(page));
    await fetchBlueskyFollowers('did:plc:alice');
    expect(followers.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/did%3Aplc%3Aalice/followers');
  });

  it('フォロー一覧とフォロワー一覧を cursor つきで取る', async () => {
    const follows = stubFetch(json({ actors: [], cursor: null, viewerDid: 'did:plc:me' }));
    await fetchBlueskyFollows('alice.bsky.social', 'abc def');
    expect(follows.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profiles/alice.bsky.social/follows?cursor=abc+def');

    const followers = stubFetch(json({ actors: [], cursor: null, viewerDid: 'did:plc:me' }));
    await fetchBlueskyFollowers('alice.bsky.social', 'abc def');
    expect(followers.mock.calls[0]?.[0]).toBe(
      '/api/iori/v1/bluesky/profiles/alice.bsky.social/followers?cursor=abc+def',
    );
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

  it('フォロー一覧の読み込み失敗の文言を、ログイン失敗、連携の無効、それ以外と、一覧の種類で分ける', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyFollows('x'));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyFollowers('x'));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskyFollows('x'));

    expect(blueskyFollowListFailureMessage(login, 'follows', 'first')).toBe(
      'Bluesky にログインできないため、フォローを読み込めませんでした',
    );
    expect(blueskyFollowListFailureMessage(login, 'followers', 'first')).toBe(
      'Bluesky にログインできないため、フォロワーを読み込めませんでした',
    );
    expect(blueskyFollowListFailureMessage(login, 'follows', 'more')).toBe(
      'Bluesky にログインできないため、続きを読み込めませんでした',
    );
    expect(blueskyFollowListFailureMessage(disabled, 'followers', 'first')).toBe('Bluesky 連携が無効です');
    expect(blueskyFollowListFailureMessage(other, 'follows', 'first')).toBe('フォローを読み込めませんでした');
    expect(blueskyFollowListFailureMessage(other, 'followers', 'first')).toBe('フォロワーを読み込めませんでした');
    expect(blueskyFollowListFailureMessage(other, 'followers', 'more')).toBe('続きを読み込めませんでした');
  });

  it('いいねした投稿の読み込み失敗の文言を、ログイン失敗、連携の無効、それ以外で分ける', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyLikedPosts());
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyLikedPosts());
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskyLikedPosts());

    expect(blueskyLikedPostsFailureMessage(login, 'first')).toBe(
      'Bluesky にログインできないため、いいねした投稿を読み込めませんでした',
    );
    expect(blueskyLikedPostsFailureMessage(login, 'more')).toBe(
      'Bluesky にログインできないため、続きを読み込めませんでした',
    );
    expect(blueskyLikedPostsFailureMessage(disabled, 'first')).toBe('Bluesky 連携が無効です');
    expect(blueskyLikedPostsFailureMessage(disabled, 'more')).toBe('Bluesky 連携が無効です');
    expect(blueskyLikedPostsFailureMessage(other, 'first')).toBe('Bluesky でいいねした投稿を読み込めませんでした');
    expect(blueskyLikedPostsFailureMessage(other, 'more')).toBe('続きを読み込めませんでした');
    expect(blueskyLikedPostsFailureMessage(new Error('x'), 'first')).toBe(
      'Bluesky でいいねした投稿を読み込めませんでした',
    );
    expect(blueskyLikedPostsFailureMessage(new Error('x'), 'more')).toBe('続きを読み込めませんでした');
  });
});

describe('own Bluesky profile', () => {
  it('自分のプロフィールを取る', async () => {
    const profile = {
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      displayName: null,
      description: null,
      avatar: null,
      banner: null,
    };
    const fetchStub = stubFetch(json(profile));

    expect(await fetchOwnBlueskyProfile()).toEqual(profile);
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/profile');
  });

  it('保存は FormData を PUT し、Content-Type は付けない', async () => {
    const fetchStub = stubFetch(json({ uri: 'at://did:plc:me/app.bsky.actor.profile/self', cid: 'bafy' }));
    const body = new FormData();
    body.append('display_name', '岩佐');

    expect(await updateOwnBlueskyProfile(body)).toEqual({
      uri: 'at://did:plc:me/app.bsky.actor.profile/self',
      cid: 'bafy',
    });
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(body);
    expect(init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('保存の失敗は、422 なら error をそのまま、それ以外は固定の文言にする', async () => {
    stubFetch(json({ error: '表示名が長すぎます', code: 'profile_invalid' }, 422));
    const invalid = await failure(updateOwnBlueskyProfile(new FormData()));
    expect(ownBlueskyProfileSaveFailureMessage(invalid)).toBe('表示名が長すぎます');

    stubFetch(json({ error: 'upstream' }, 502));
    const upstream = await failure(updateOwnBlueskyProfile(new FormData()));
    expect(ownBlueskyProfileSaveFailureMessage(upstream)).toBe('Bluesky のプロフィールを保存できませんでした');
    expect(ownBlueskyProfileSaveFailureMessage(new Error('x'))).toBe('Bluesky のプロフィールを保存できませんでした');
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
