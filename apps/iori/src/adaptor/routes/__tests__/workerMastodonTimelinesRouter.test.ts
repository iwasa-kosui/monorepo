import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { StatusSchema } from '../../mastodon/entities.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerMastodonTimelinesRouter } from '../workerMastodonTimelinesRouter.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

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
      media_attachments: [{ id: imageId, type: 'image', url: 'https://iori.test/uploads/a.png', description: 'alt' }],
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

  it('actor のない利用者は 422 にする', async () => {
    const t = await seedHome();
    const withoutActor = await t.bearerFor('read');

    const response = await t.request('/api/v1/timelines/home', { headers: withoutActor });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Actor not found' });
  });

  it('ミュートした相手の投稿を除く', async () => {
    const t = await seedHome();
    t.seed.addMute(t.me.userId, t.alice.actorId);

    const response = await t.request('/api/v1/timelines/home', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([t.mine.postId]);
  });

  it('ブロックした相手の投稿とリポストを除く', async () => {
    const t = await seedHome();
    t.seed.addBlock(t.me.userId, t.alice.actorId);

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

  const seedLongHome = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    t.seed.addFollow(me.actorId, alice.actorId);
    t.seed.addFollow(me.actorId, bob.actorId);
    const mine = t.seed.addLocalPost(me, 1_000);
    const notes = [2_000, 3_000, 5_000, 7_000].map((createdAt) =>
      t.seed.addRemotePost(alice, createdAt, { timeline: true })
    );
    const bobNote = t.seed.addRemotePost(bob, 6_000, { timeline: true });
    const boostByMe = t.seed.addRepost(me.actorId, notes[0]!.postId, 4_000);
    const boostByBob = t.seed.addRepost(bob.actorId, notes[1]!.postId, 8_000);
    const boostByAlice = t.seed.addRepost(alice.actorId, mine.postId, 9_000);
    const newestFirst = [
      boostByAlice.repostId,
      boostByBob.repostId,
      notes[3]!.postId,
      bobNote.postId,
      notes[2]!.postId,
      boostByMe.repostId,
      notes[1]!.postId,
      notes[0]!.postId,
      mine.postId,
    ];
    return { ...t, me, newestFirst };
  };

  it('Link の next の URL をそのまま取得すると古い投稿が返り、最後は空で Link が付かない', async () => {
    const t = await seedLongHome();

    const collected: string[] = [];
    let response = await t.request('/api/v1/timelines/home?limit=2', { headers: t.me.bearer });
    let pages = 0;
    while (pages < 20) {
      const ids = idsOf(await response.json());
      if (ids.length === 0) break;
      collected.push(...ids);
      const next = linkOf(response, 'next');
      expect(next).toBeDefined();
      response = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });
      pages++;
    }

    expect(collected).toEqual(t.newestFirst);
    expect(new Set(collected).size).toBe(collected.length);
    expect(response.headers.get('Link')).toBeNull();
  });

  it('本文の最後の id を max_id にしても全投稿を新しい順に重複なく辿れる', async () => {
    const t = await seedLongHome();

    const collected: string[] = [];
    let maxId: string | undefined;
    for (let pages = 0; pages < 20; pages++) {
      const query = maxId === undefined ? 'limit=2' : `limit=2&max_id=${maxId}`;
      const ids = idsOf(await (await t.request(`/api/v1/timelines/home?${query}`, { headers: t.me.bearer })).json());
      if (ids.length === 0) break;
      collected.push(...ids);
      maxId = ids[ids.length - 1];
    }

    expect(collected).toEqual(t.newestFirst);
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('username が NULL の remote actor のブーストがページの末尾にあっても次のページに進める', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const ghost = t.seed.addRemoteActor('ghost');
    t.sqlite.prepare('UPDATE remote_actors SET username = NULL WHERE actorId = ?').run(ghost.actorId);
    t.seed.addFollow(me.actorId, ghost.actorId);
    const oldest = t.seed.addLocalPost(me, 1_000);
    const note = t.seed.addLocalPost(me, 2_000);
    const boost = t.seed.addRepost(ghost.actorId, note.postId, 3_000);

    const collected: string[] = [];
    let maxId: string | undefined;
    for (let pages = 0; pages < 5; pages++) {
      const query = maxId === undefined ? 'limit=1' : `limit=1&max_id=${maxId}`;
      const ids = idsOf(await (await t.request(`/api/v1/timelines/home?${query}`, { headers: me.bearer })).json());
      if (ids.length === 0) break;
      collected.push(...ids);
      maxId = ids[ids.length - 1];
    }

    expect(collected).toEqual([boost.repostId, note.postId, oldest.postId]);
  });

  it('同じ postId の post の行が時刻の近い 2 行で隣り合い、古い行がページの末尾にあっても次のページに進む', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const oldest = t.seed.addLocalPost(me, 1_000);
    const duplicated = t.seed.addLocalPost(me, 2_900);
    t.seed.addTimelineItem(me.actorId, duplicated.postId, 3_000);

    const first = await t.request('/api/v1/timelines/home?limit=2', { headers: me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: me.bearer });

    expect(idsOf(await first.json())).toEqual([duplicated.postId, duplicated.postId]);
    expect(idsOf(await second.json())).toEqual([duplicated.postId, oldest.postId]);
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
    const remote = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
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

  it('ローカルの経路でも、トークンのスコープが足りなければ 403、Cookie とアプリトークンは通す', async () => {
    const t = await seedPublic();
    const writeOnly = await t.bearerFor('write');
    const app = await t.issueAppToken('read');

    const responses = await Promise.all([
      t.request('/api/v1/timelines/public', { headers: writeOnly }),
      t.request('/api/v1/timelines/public', { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
      t.request('/api/v1/timelines/public', { headers: { Authorization: `Bearer ${app.token}` } }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 200, 200]);
  });

  it('ログイン中はミュートしたローカルのアクターの投稿を除く', async () => {
    const t = await seedPublic();
    const other = t.seed.addLocalActor('other');
    const otherPost = t.seed.addLocalPost(other, 4_000);
    t.seed.addMute(t.me.userId, other.actorId);

    const [muted, anonymous] = await Promise.all([
      t.request('/api/v1/timelines/public?local=true', { headers: t.me.bearer }),
      t.request('/api/v1/timelines/public?local=true'),
    ]);

    expect(idsOf(await muted.json())).toEqual([t.local.postId]);
    expect(idsOf(await anonymous.json())).toEqual([otherPost.postId, t.local.postId]);
  });

  it('ログイン中はブロックしたローカルのアクターの投稿を除く', async () => {
    const t = await seedPublic();
    const other = t.seed.addLocalActor('other');
    t.seed.addLocalPost(other, 4_000);
    t.seed.addBlock(t.me.userId, other.actorId);

    const response = await t.request('/api/v1/timelines/public?local=true', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([t.local.postId]);
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

  it('local の経路でも Link の next の URL をそのまま取得すると古い投稿が返る', async () => {
    const t = await seedPublic();
    const newer = t.seed.addLocalPost(t.me, 4_000);

    const first = await t.request('/api/v1/timelines/public?local=true&limit=1', { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });
    const lastNext = linkOf(second, 'next');
    const third = await t.request(`${lastNext?.pathname}${lastNext?.search}`, { headers: t.me.bearer });

    expect(idsOf(await first.json())).toEqual([newer.postId]);
    expect(idsOf(await second.json())).toEqual([t.local.postId]);
    expect(await third.json()).toEqual([]);
    expect(third.headers.get('Link')).toBeNull();
  });

  it('remote=true はミュートした投稿者を除き、max_id と Link でページを送る', async () => {
    const t = await seedPublic();
    const bob = t.seed.addRemoteActor('bob');
    const second = t.seed.addRemotePost(bob, 1_500, { visibility: 'public' });
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

  it('remote=true はブロックした相手のリレーの投稿を除く', async () => {
    const t = await seedPublic();
    const bob = t.seed.addRemoteActor('bob');
    const second = t.seed.addRemotePost(bob, 1_500, { visibility: 'public' });
    t.seed.addFederatedItem(second.postId, t.seed.addRelay(), 2_000);
    t.seed.addBlock(t.me.userId, bob.actorId);

    const response = await t.request('/api/v1/timelines/public?remote=true', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([t.remote.postId]);
  });
});

describe('タイムラインの内部エラー', () => {
  const setupFailing = (overrides: Record<string, unknown>) => {
    const harness = createOAuthHarness();
    const authn = createMastodonAuthn({
      verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
      sessionResolver: harness.memory.sessionResolver as never,
    });
    const ok = (val: unknown) => ({ resolve: async () => ({ ok: true, val }) });
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (root) => {
        root.route(
          '/api',
          createWorkerMastodonTimelinesRouter({
            authn,
            actorResolverByUserId: ok({ id: '00000000-0000-4000-8000-000000000001' }),
            actorsResolverByFollowerId: ok([]),
            mutedActorIdsResolverByUserId: ok([]),
            timelineItemsResolverByActorIds: ok([]),
            localPostsResolverByPage: ok([]),
            federatedTimelineItemsResolver: ok([]),
            statusAssembler: { assemble: async () => [], assembleAccounts: async () => [] },
            ...overrides,
          } as never),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('og', { status: 200 }),
    });
    return { harness, app };
  };

  const internalError = { error: 'Internal server error' };

  it('Resolver の失敗は 401 ではなく 500 にする', async () => {
    const failure = { resolve: async () => ({ ok: false }) };
    const cases = [
      { actorResolverByUserId: failure },
      { actorsResolverByFollowerId: failure },
      { timelineItemsResolverByActorIds: failure },
    ];
    for (const override of cases) {
      const { harness, app } = setupFailing(override);
      const { token } = await harness.issueUserToken('read');

      const response = await app.request(`${ORIGIN}/api/v1/timelines/home`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual(internalError);
    }
  });

  const failWith = (thrown: unknown) =>
    setupFailing({
      statusAssembler: {
        assemble: async () => {
          throw thrown;
        },
        assembleAccounts: async () => [],
      },
    }).app;

  it('DrizzleQueryError はパラメーターと stack をログに出さず、SQL と cause の message だけを出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const thrown = new DrizzleQueryError(
      'insert into posts (content) values (?)',
      ['secret-body'],
      new Error('cause-message'),
    );

    const response = await failWith(thrown).request(`${ORIGIN}/api/v1/timelines/public`);

    const logged = JSON.stringify(error.mock.calls);
    error.mockRestore();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(internalError);
    expect(logged).not.toContain('secret-body');
    expect(logged).toContain('insert into posts (content) values (?)');
    expect(logged).toContain('cause-message');
  });

  it('それ以外の例外は name と message だけをログに出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await failWith(new TypeError('x'.repeat(300))).request(`${ORIGIN}/api/v1/timelines/public`);

    const logged = JSON.stringify(error.mock.calls);
    error.mockRestore();
    expect(response.status).toBe(500);
    expect(logged).toContain('TypeError');
    expect(logged).toContain('x'.repeat(200));
    expect(logged).not.toContain('x'.repeat(201));
    expect(logged).not.toContain('at ');
  });

  it('public の Resolver の失敗と、組み立ての例外も 500 にする', async () => {
    const failure = { resolve: async () => ({ ok: false }) };
    const throwing = {
      assemble: async () => {
        throw new Error('boom');
      },
      assembleAccounts: async () => [],
    };
    for (const override of [{ localPostsResolverByPage: failure }, { statusAssembler: throwing }]) {
      const { app } = setupFailing(override);

      const response = await app.request(`${ORIGIN}/api/v1/timelines/public`);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual(internalError);
    }
  });
});
