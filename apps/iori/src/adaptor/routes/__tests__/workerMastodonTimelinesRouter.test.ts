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

  it('認証がなければ 401、スコープが足りなければ 403 にする', async () => {
    const t = await seedHome('read:accounts');

    const [anonymous, forbidden] = await Promise.all([
      t.request('/api/v1/timelines/home'),
      t.request('/api/v1/timelines/home', { headers: t.me.bearer }),
    ]);

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
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
});
