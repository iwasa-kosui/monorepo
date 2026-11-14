import { describe, expect, it } from 'vitest';

import { AccountSchema, StatusSchema } from '../../mastodon/entities.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

describe('GET /api/v1/favourites', () => {
  const seedFavourites = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const oldest = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const middle = t.seed.addLocalPost(me, 2_000);
    const newest = t.seed.addRemotePost(alice, 3_000, { visibility: 'public' });
    const deleted = t.seed.addLocalPost(me, 4_000, { deletedAt: 5_000 });
    const notLiked = t.seed.addRemotePost(alice, 6_000, { visibility: 'public' });
    const likeOldest = t.seed.addLike(me.actorId, oldest.postId, 10_000);
    const likeMiddle = t.seed.addLike(me.actorId, middle.postId, 20_000);
    const likeNewest = t.seed.addLike(me.actorId, newest.postId, 30_000);
    t.seed.addLike(me.actorId, deleted.postId, 40_000);
    const likeIds = [likeNewest.likeId, likeMiddle.likeId, likeOldest.likeId];
    const postIds = [newest.postId, middle.postId, oldest.postId];
    return { ...t, me, alice, notLiked, deleted, likeIds, postIds };
  };

  it('自分のいいねを新しい順に Status で返し、削除済みの投稿を除く', async () => {
    const t = await seedFavourites();

    const response = await t.request('/api/v1/favourites', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const statuses = (await response.json() as unknown[]).map((item) => StatusSchema.parse(item));
    expect(statuses.map((status) => status.id)).toEqual(t.postIds);
    expect(statuses.every((status) => status.favourited === true)).toBe(true);
    expect(statuses[0]).toMatchObject({ account: { id: t.alice.actorId, acct: 'alice@remote.example' } });
  });

  it('いいねの時刻の順に並べ、投稿の時刻には従わない', async () => {
    const t = await seedFavourites();
    t.seed.addLike(t.me.actorId, t.notLiked.postId, 5);

    const response = await t.request('/api/v1/favourites', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([...t.postIds, t.notLiked.postId]);
  });

  it('他人のいいねを返さない', async () => {
    const t = await seedFavourites();
    const other = t.seed.addLocalActor('other');
    t.seed.addLike(other.actorId, t.notLiked.postId, 50_000);

    const response = await t.request('/api/v1/favourites', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual(t.postIds);
  });

  it('limit と max_id と Link ヘッダーで likeId を位置にしてページを送る', async () => {
    const t = await seedFavourites();

    const first = await t.request('/api/v1/favourites?limit=2', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual(t.postIds.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.likeIds[1]);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.likeIds[0]);
    expect(next?.searchParams.get('limit')).toBe('2');
    expect(idsOf(await second.json())).toEqual([t.postIds[2]]);
    expect(linkOf(second, 'next')?.searchParams.get('max_id')).toBe(t.likeIds[2]);
  });

  it('他人のいいねの ID を max_id に使っても、その時刻を位置にしない', async () => {
    const t = await seedFavourites();
    const other = t.seed.addLocalActor('other');
    const foreign = t.seed.addLike(other.actorId, t.notLiked.postId, 15_000);

    const response = await t.request(`/api/v1/favourites?max_id=${foreign.likeId}`, { headers: t.me.bearer });

    expect(await response.json()).toEqual([]);
  });

  it('いいねしても宛先外の direct とフォローしていない private は返さず、フォロー中の private と宛先の direct は返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    t.seed.addFollow(me.actorId, bob.actorId);
    const direct = t.seed.addRemotePost(alice, 1_000, { visibility: 'direct' });
    const unfollowedPrivate = t.seed.addRemotePost(alice, 2_000, { visibility: 'private' });
    const toMe = t.seed.addRemotePost(alice, 3_000, {
      visibility: 'direct',
      recipientActorUris: ['https://iori.test/users/kosui'],
    });
    const followedPrivate = t.seed.addRemotePost(bob, 4_000, { visibility: 'private' });
    [direct, unfollowedPrivate, toMe, followedPrivate].forEach((post, index) =>
      t.seed.addLike(me.actorId, post.postId, 10_000 + index)
    );

    const response = await t.request('/api/v1/favourites', { headers: me.bearer });

    expect(idsOf(await response.json())).toEqual([followedPrivate.postId, toMe.postId]);
  });

  it('見えない投稿を除いても、limit の件数まで埋める', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const visible = [1_000, 2_000, 3_000].map((at) => t.seed.addRemotePost(alice, at, { visibility: 'public' }));
    visible.forEach((post, index) => t.seed.addLike(me.actorId, post.postId, 10_000 + index));
    for (const at of [4_000, 5_000, 6_000]) {
      t.seed.addLike(me.actorId, t.seed.addRemotePost(alice, at, { visibility: 'direct' }).postId, 10_000 + at);
    }

    const response = await t.request('/api/v1/favourites?limit=3', { headers: me.bearer });

    expect(idsOf(await response.json())).toEqual(visible.map((post) => post.postId).reverse());
  });

  it('認証がなければ 401、スコープが足りなければ 403 にし、Cookie は通す', async () => {
    const t = await seedFavourites();

    const [anonymous, forbidden, cookie] = await Promise.all([
      t.request('/api/v1/favourites'),
      t.request('/api/v1/favourites', { headers: await t.bearerFor('read:statuses') }),
      t.request('/api/v1/favourites', { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
    ]);

    expect([anonymous.status, forbidden.status, cookie.status]).toEqual([401, 403, 200]);
  });
});

describe('GET /api/v1/bookmarks', () => {
  const seedBookmarks = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const oldest = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const middle = t.seed.addLocalPost(me, 2_000);
    const newest = t.seed.addRemotePost(alice, 3_000, { visibility: 'public' });
    const deleted = t.seed.addLocalPost(me, 4_000, { deletedAt: 5_000 });
    const notBookmarked = t.seed.addRemotePost(alice, 6_000, { visibility: 'public' });
    const bookmarkOldest = t.seed.addBookmark(me.actorId, oldest.postId, 10_000);
    const bookmarkMiddle = t.seed.addBookmark(me.actorId, middle.postId, 20_000);
    const bookmarkNewest = t.seed.addBookmark(me.actorId, newest.postId, 30_000);
    t.seed.addBookmark(me.actorId, deleted.postId, 40_000);
    const bookmarkIds = [bookmarkNewest.bookmarkId, bookmarkMiddle.bookmarkId, bookmarkOldest.bookmarkId];
    const postIds = [newest.postId, middle.postId, oldest.postId];
    return { ...t, me, alice, notBookmarked, bookmarkIds, postIds };
  };

  it('自分のブックマークを新しい順に Status で返し、削除済みの投稿を除く', async () => {
    const t = await seedBookmarks();

    const response = await t.request('/api/v1/bookmarks', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const statuses = (await response.json() as unknown[]).map((item) => StatusSchema.parse(item));
    expect(statuses.map((status) => status.id)).toEqual(t.postIds);
    expect(statuses.every((status) => status.bookmarked === true)).toBe(true);
    expect(statuses[0]).toMatchObject({ account: { id: t.alice.actorId, acct: 'alice@remote.example' } });
  });

  it('他人のブックマークを返さない', async () => {
    const t = await seedBookmarks();
    const other = t.seed.addLocalActor('other');
    t.seed.addBookmark(other.actorId, t.notBookmarked.postId, 50_000);

    const response = await t.request('/api/v1/bookmarks', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual(t.postIds);
  });

  it('limit と max_id と Link ヘッダーで bookmarkId を位置にしてページを送る', async () => {
    const t = await seedBookmarks();

    const first = await t.request('/api/v1/bookmarks?limit=2', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual(t.postIds.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.bookmarkIds[1]);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.bookmarkIds[0]);
    expect(next?.searchParams.get('limit')).toBe('2');
    expect(idsOf(await second.json())).toEqual([t.postIds[2]]);
    expect(linkOf(second, 'next')?.searchParams.get('max_id')).toBe(t.bookmarkIds[2]);
  });

  it('ブックマークしても見えない direct は返さない', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const visible = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const direct = t.seed.addRemotePost(alice, 2_000, { visibility: 'direct' });
    t.seed.addBookmark(me.actorId, visible.postId, 10_000);
    t.seed.addBookmark(me.actorId, direct.postId, 20_000);

    const response = await t.request('/api/v1/bookmarks', { headers: me.bearer });

    expect(idsOf(await response.json())).toEqual([visible.postId]);
  });

  it('認証がなければ 401、スコープが足りなければ 403 にし、Cookie は通す', async () => {
    const t = await seedBookmarks();

    const [anonymous, forbidden, cookie] = await Promise.all([
      t.request('/api/v1/bookmarks'),
      t.request('/api/v1/bookmarks', { headers: await t.bearerFor('read:favourites') }),
      t.request('/api/v1/bookmarks', { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
    ]);

    expect([anonymous.status, forbidden.status, cookie.status]).toEqual([401, 403, 200]);
  });
});

describe('GET /api/v1/mutes', () => {
  const seedMutes = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    const carol = t.seed.addRemoteActor('carol');
    const muteAlice = t.seed.addMute(me.userId, alice.actorId, 1_000);
    const muteBob = t.seed.addMute(me.userId, bob.actorId, 2_000);
    const muteCarol = t.seed.addMute(me.userId, carol.actorId, 3_000);
    const other = t.seed.addLocalActor('other');
    const foreign = t.seed.addMute(other.userId, alice.actorId, 4_000);
    return {
      ...t,
      me,
      alice,
      bob,
      carol,
      foreign,
      muteIds: [muteCarol.muteId, muteBob.muteId, muteAlice.muteId],
      accountIds: [carol.actorId, bob.actorId, alice.actorId],
    };
  };

  it('ミュートしたアカウントを新しい順に Account で返し、他人のミュートを含めない', async () => {
    const t = await seedMutes();

    const response = await t.request('/api/v1/mutes', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const accounts = (await response.json() as unknown[]).map((item) => AccountSchema.parse(item));
    expect(accounts.map((account) => account.id)).toEqual(t.accountIds);
    expect(accounts[0]).toMatchObject({ username: 'carol', acct: 'carol@remote.example' });
  });

  it('limit と max_id と Link ヘッダーで muteId を位置にしてページを送る', async () => {
    const t = await seedMutes();

    const first = await t.request('/api/v1/mutes?limit=2', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual(t.accountIds.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.muteIds[1]);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.muteIds[0]);
    expect(idsOf(await second.json())).toEqual([t.accountIds[2]]);
    expect(linkOf(second, 'next')?.searchParams.get('max_id')).toBe(t.muteIds[2]);
  });

  it('limit は最大 80 に切る', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    for (let n = 0; n < 85; n++) t.seed.addMute(me.userId, t.seed.addRemoteActor(`user${n}`).actorId, 1_000 + n);

    const [capped, defaulted] = await Promise.all([
      t.request('/api/v1/mutes?limit=200', { headers: me.bearer }),
      t.request('/api/v1/mutes', { headers: me.bearer }),
    ]);

    expect(idsOf(await capped.json())).toHaveLength(80);
    expect(idsOf(await defaulted.json())).toHaveLength(40);
  });

  it('認証がなければ 401、スコープが足りなければ 403 にし、Cookie は通す', async () => {
    const t = await seedMutes();

    const [anonymous, forbidden, cookie] = await Promise.all([
      t.request('/api/v1/mutes'),
      t.request('/api/v1/mutes', { headers: await t.bearerFor('read:accounts') }),
      t.request('/api/v1/mutes', { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
    ]);

    expect([anonymous.status, forbidden.status, cookie.status]).toEqual([401, 403, 200]);
  });
});

describe('GET /api/v1/blocks', () => {
  const seedBlocks = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    const carol = t.seed.addRemoteActor('carol');
    const blockAlice = t.seed.addBlock(me.userId, alice.actorId, 1_000);
    const blockBob = t.seed.addBlock(me.userId, bob.actorId, 2_000);
    const blockCarol = t.seed.addBlock(me.userId, carol.actorId, 3_000);
    const other = t.seed.addLocalActor('other');
    const foreign = t.seed.addBlock(other.userId, alice.actorId, 4_000);
    t.seed.addMute(me.userId, t.seed.addRemoteActor('dave').actorId, 5_000);
    return {
      ...t,
      me,
      foreign,
      blockIds: [blockCarol.blockId, blockBob.blockId, blockAlice.blockId],
      accountIds: [carol.actorId, bob.actorId, alice.actorId],
    };
  };

  it('ブロックしたアカウントを新しい順に Account で返し、他人のブロックとミュートを含めない', async () => {
    const t = await seedBlocks();

    const response = await t.request('/api/v1/blocks', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const accounts = (await response.json() as unknown[]).map((item) => AccountSchema.parse(item));
    expect(accounts.map((account) => account.id)).toEqual(t.accountIds);
    expect(accounts[0]).toMatchObject({ username: 'carol', acct: 'carol@remote.example' });
  });

  it('limit と max_id と Link ヘッダーで blockId を位置にしてページを送る', async () => {
    const t = await seedBlocks();

    const first = await t.request('/api/v1/blocks?limit=2', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual(t.accountIds.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.blockIds[1]);
    expect(idsOf(await second.json())).toEqual([t.accountIds[2]]);
  });

  it('認証がなければ 401、スコープが足りなければ 403 にし、Cookie は通す', async () => {
    const t = await seedBlocks();

    const [anonymous, forbidden, cookie] = await Promise.all([
      t.request('/api/v1/blocks'),
      t.request('/api/v1/blocks', { headers: await t.bearerFor('read:mutes') }),
      t.request('/api/v1/blocks', { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
    ]);

    expect([anonymous.status, forbidden.status, cookie.status]).toEqual([401, 403, 200]);
  });
});
