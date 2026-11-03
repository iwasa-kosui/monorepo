import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

const parseStatuses = (body: unknown) => (body as unknown[]).map((item) => StatusSchema.parse(item));

describe('GET /api/v1/timelines/home', () => {
  const seedHome = async (scope = 'read') => {
    const t = setupReadApi();
    const me = await t.signIn(scope);
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(me.actorId, alice.actorId);
    const mine = t.seed.addLocalPost(me, 1_000, { content: '<p>mine</p>' });
    const note = t.seed.addRemotePost(alice, 2_000, { timeline: true, inReplyToUri: mine.uri });
    const boost = t.seed.addRepost(me.actorId, note.postId, 3_000);
    return { ...t, me, alice, mine, note, boost };
  };

  it('Bearer で投稿とブーストを新しい順に返し、スキーマで parse できる', async () => {
    const t = await seedHome();
    t.seed.addLike(t.me.actorId, t.note.postId);
    t.seed.addEmojiReact(t.me.actorId, t.note.postId, '🎉');
    t.seed.addEmojiReact(t.alice.actorId, t.note.postId, '👍');
    const imageId = t.seed.addImage(t.mine.postId, '/uploads/a.png', 'alt');
    t.seed.addLinkPreview(t.mine.postId, 'https://example.com', 'Example', 'https://example.com/favicon.ico');

    const response = await t.request('/api/v1/timelines/home', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const statuses = parseStatuses(await response.json());
    expect(statuses.map((status) => status.id)).toEqual([t.boost.repostId, t.note.postId, t.mine.postId]);
    const [boost, note, mine] = statuses;
    expect(boost).toMatchObject({
      account: { id: t.me.actorId, username: 'kosui' },
      reblog: { id: t.note.postId, account: { id: t.alice.actorId, acct: 'alice@remote.example' } },
      content: '',
    });
    expect(note).toMatchObject({
      favourited: true,
      in_reply_to_id: t.mine.postId,
      in_reply_to_account_id: t.me.actorId,
      iori: { reactions: expect.arrayContaining([{ emoji: '🎉', count: 1, url: null, me: true }]) },
    });
    expect(note?.iori?.reactions.find((reaction) => reaction.emoji === '👍')?.me).toBe(false);
    expect(mine).toMatchObject({
      replies_count: 1,
      media_attachments: [{ id: imageId, type: 'image', url: '/uploads/a.png', description: 'alt' }],
      iori: {
        link_previews: [{
          url: 'https://example.com',
          site_name: 'Example',
          favicon: 'https://example.com/favicon.ico',
        }],
      },
    });
  });

  it('Cookie でも返す', async () => {
    const t = await seedHome();

    const response = await t.request('/api/v1/timelines/home', { headers: { Cookie: `sessionId=${t.me.sessionId}` } });

    expect(response.status).toBe(200);
    expect(parseStatuses(await response.json())).toHaveLength(3);
  });

  it('認証がなければ 401、スコープが足りなければ 403 にする', async () => {
    const t = await seedHome('read:accounts');

    const [anonymous, forbidden] = await Promise.all([
      t.request('/api/v1/timelines/home'),
      t.request('/api/v1/timelines/home', { headers: t.me.bearer }),
    ]);

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('ミュートした相手の投稿を除く', async () => {
    const t = await seedHome();
    t.seed.addMute(t.me.userId, t.alice.actorId);

    const response = await t.request('/api/v1/timelines/home', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([t.mine.postId]);
  });

  it('limit と max_id と Link ヘッダーでページを送る', async () => {
    const t = await seedHome();

    const first = await t.request('/api/v1/timelines/home?limit=2', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const prev = linkOf(first, 'prev');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual([t.boost.repostId, t.note.postId]);
    expect(next?.searchParams.get('max_id')).toBe(t.note.postId);
    expect(next?.searchParams.get('limit')).toBe('2');
    expect(prev?.searchParams.get('min_id')).toBe(t.boost.repostId);
    expect(idsOf(await second.json())).toEqual([t.mine.postId]);
  });

  it('同じミリ秒の 2 件を max_id で取りこぼさない', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const posts = [t.seed.addLocalPost(me, 5_000), t.seed.addLocalPost(me, 5_000), t.seed.addLocalPost(me, 4_000)];

    const first = await t.request('/api/v1/timelines/home?limit=1', { headers: me.bearer });
    const firstId = idsOf(await first.json())[0]!;
    const second = await t.request(`/api/v1/timelines/home?limit=1&max_id=${firstId}`, { headers: me.bearer });
    const secondId = idsOf(await second.json())[0]!;
    const third = await t.request(`/api/v1/timelines/home?limit=1&max_id=${secondId}`, { headers: me.bearer });

    expect(new Set([firstId, secondId])).toEqual(new Set([posts[0]!.postId, posts[1]!.postId]));
    expect(idsOf(await third.json())).toEqual([posts[2]!.postId]);
  });

  it('min_id は新しい側を古い順に limit 件取って新しい順に返し、since_id は新しい側の最新を返す', async () => {
    const t = await seedHome();

    const min = await t.request(`/api/v1/timelines/home?min_id=${t.mine.postId}&limit=1`, { headers: t.me.bearer });
    const since = await t.request(`/api/v1/timelines/home?since_id=${t.mine.postId}&limit=1`, { headers: t.me.bearer });
    const minAll = await t.request(`/api/v1/timelines/home?min_id=${t.mine.postId}`, { headers: t.me.bearer });

    expect(idsOf(await min.json())).toEqual([t.note.postId]);
    expect(idsOf(await since.json())).toEqual([t.boost.repostId]);
    expect(idsOf(await minAll.json())).toEqual([t.boost.repostId, t.note.postId]);
    expect(linkOf(min, 'prev')?.searchParams.get('min_id')).toBe(t.note.postId);
    expect(linkOf(min, 'next')?.searchParams.get('max_id')).toBe(t.note.postId);
  });

  it('要素が 0 件なら Link を付けない', async () => {
    const t = await seedHome();

    const response = await t.request(`/api/v1/timelines/home?max_id=${t.mine.postId}`, { headers: t.me.bearer });

    expect(await response.json()).toEqual([]);
    expect(response.headers.get('Link')).toBeNull();
  });

  it('limit は最大 40 に丸め、不正な値は既定の 20 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    for (let i = 0; i < 45; i++) t.seed.addLocalPost(me, 1_000 + i);

    const [big, bad, none] = await Promise.all([
      t.request('/api/v1/timelines/home?limit=1000', { headers: me.bearer }),
      t.request('/api/v1/timelines/home?limit=abc', { headers: me.bearer }),
      t.request('/api/v1/timelines/home', { headers: me.bearer }),
    ]);

    expect(idsOf(await big.json())).toHaveLength(40);
    expect(idsOf(await bad.json())).toHaveLength(20);
    expect(idsOf(await none.json())).toHaveLength(20);
  });
});

describe('GET /api/v1/timelines/public', () => {
  const seedPublic = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const local = t.seed.addLocalPost(me, 1_000);
    const remote = t.seed.addRemotePost(alice, 2_000);
    const relay = t.seed.addRelay();
    t.seed.addFederatedItem(remote.postId, relay, 3_000);
    return { ...t, me, alice, local, remote };
  };

  it('local=true は認証なしでローカルの投稿を返す', async () => {
    const t = await seedPublic();

    const response = await t.request('/api/v1/timelines/public?local=true');

    expect(response.status).toBe(200);
    const statuses = parseStatuses(await response.json());
    expect(statuses.map((status) => status.id)).toEqual([t.local.postId]);
    expect(statuses[0]?.favourited).toBe(false);
  });

  it('指定がなければ local と同じ内容を返し、認証した利用者の状態を入れる', async () => {
    const t = await seedPublic();
    t.seed.addLike(t.me.actorId, t.local.postId);

    const anonymous = await t.request('/api/v1/timelines/public');
    const signedIn = await t.request('/api/v1/timelines/public', { headers: t.me.bearer });

    expect(idsOf(await anonymous.json())).toEqual([t.local.postId]);
    expect(parseStatuses(await signedIn.json())[0]?.favourited).toBe(true);
  });

  it('remote=true は未認証なら 401、スコープ不足なら 403、認証済みならリレーの投稿を返す', async () => {
    const t = await seedPublic();
    const writeOnly = await t.bearerFor('write');

    const [anonymous, forbidden, allowed] = await Promise.all([
      t.request('/api/v1/timelines/public?remote=true'),
      t.request('/api/v1/timelines/public?remote=true', { headers: writeOnly }),
      t.request('/api/v1/timelines/public?remote=true', { headers: t.me.bearer }),
    ]);

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(idsOf(await allowed.json())).toEqual([t.remote.postId]);
  });

  it('remote=true はミュートした投稿者を除き、max_id と Link でページを送る', async () => {
    const t = await seedPublic();
    const bob = t.seed.addRemoteActor('bob');
    const second = t.seed.addRemotePost(bob, 1_500);
    const relay = t.seed.addRelay();
    t.seed.addFederatedItem(second.postId, relay, 2_000);

    const first = await t.request('/api/v1/timelines/public?remote=true&limit=1', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const rest = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });
    t.seed.addMute(t.me.userId, bob.actorId);
    const muted = await t.request('/api/v1/timelines/public?remote=true', { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual([t.remote.postId]);
    expect(idsOf(await rest.json())).toEqual([second.postId]);
    expect(idsOf(await muted.json())).toEqual([t.remote.postId]);
  });
});
