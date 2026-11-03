import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { Username } from '../../../domain/user/username.ts';
import { AccountSchema, StatusSchema } from '../../mastodon/entities.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerMastodonAccountsRouter } from '../workerMastodonAccountsRouter.ts';
import { createWorkerMastodonCoreRouter } from '../workerMastodonCoreRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../workerMastodonFallbackRouter.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const parseStatuses = (body: unknown) => (body as unknown[]).map((item) => StatusSchema.parse(item));

describe('GET /api/v1/accounts/:id/followers と /following', () => {
  const seedFollows = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const others = [1, 2, 3].map((n) => t.seed.addRemoteActor(`user${n}`));
    for (const other of others) {
      t.seed.addFollow(other.actorId, me.actorId);
      t.seed.addFollow(me.actorId, other.actorId);
    }
    const ids = others.map((other) => other.actorId).sort().reverse();
    return { ...t, me, others, ids };
  };

  it('未認証でもフォロワーとフォロー中を Account の配列で返す', async () => {
    const t = await seedFollows();

    const [followers, following] = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/followers`),
      t.request(`/api/v1/accounts/${t.me.actorId}/following`),
    ]);

    expect(followers.status).toBe(200);
    const body = await followers.json() as unknown[];
    expect(body.map((item) => AccountSchema.parse(item).id)).toEqual(t.ids);
    expect(AccountSchema.parse(body[0])).toMatchObject({ following_count: 1, followers_count: 1 });
    expect(idsOf(await following.json())).toEqual(t.ids);
  });

  it('limit と max_id と Link ヘッダーでページを送る', async () => {
    const t = await seedFollows();

    const first = await t.request(`/api/v1/accounts/${t.me.actorId}/followers?limit=2`);
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`);

    expect(idsOf(await first.json())).toEqual(t.ids.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.ids[1]);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.ids[0]);
    expect(idsOf(await second.json())).toEqual([t.ids[2]]);
  });

  it('要素がなければ Link を付けない', async () => {
    const t = await seedFollows();

    const lonely = t.seed.addRemoteActor('lonely');

    const response = await t.request(`/api/v1/accounts/${lonely.actorId}/following`);

    expect(await response.json()).toEqual([]);
    expect(response.headers.get('Link')).toBeNull();
  });

  it('存在しないアカウントと不正な ID は 404 にする', async () => {
    const t = await seedFollows();

    const responses = await Promise.all([
      t.request(`/api/v1/accounts/${t.seed.uuid()}/followers`),
      t.request('/api/v1/accounts/not-an-id/following'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });
});

describe('GET /api/v1/accounts/:id', () => {
  it('未認証でもローカルのアカウントを Account で返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    t.seed.addLocalPost(me, 1_000);

    const response = await t.request(`/api/v1/accounts/${me.actorId}`);

    expect(response.status).toBe(200);
    expect(AccountSchema.parse(await response.json())).toMatchObject({
      id: me.actorId,
      username: 'kosui',
      acct: 'kosui',
      statuses_count: 1,
    });
  });

  it('リモートのアカウントを acct にホストを付けて返す', async () => {
    const t = setupReadApi();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addRemotePost(alice, 1_000);

    const response = await t.request(`/api/v1/accounts/${alice.actorId}`);

    expect(response.status).toBe(200);
    expect(AccountSchema.parse(await response.json())).toMatchObject({
      id: alice.actorId,
      username: 'alice',
      acct: 'alice@remote.example',
      statuses_count: 1,
    });
  });

  it('存在しないアカウントは 404 にする', async () => {
    const t = setupReadApi();

    const response = await t.request(`/api/v1/accounts/${t.seed.uuid()}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Record not found' });
  });

  it('UUID でない ID は :id に取らせず受け皿の 404 にする', async () => {
    const t = setupReadApi();

    const responses = await Promise.all([
      t.request('/api/v1/accounts/not-an-id'),
      t.request('/api/v1/accounts/relationships?id[]=a'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });
});

describe('GET /api/v1/accounts/:id/statuses', () => {
  const seedAccounts = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const first = t.seed.addLocalPost(me, 1_000, { content: '<p>first</p>' });
    const media = t.seed.addLocalPost(me, 1_500);
    t.seed.addImage(media.postId, '/uploads/a.png', 'alt');
    const tieA = t.seed.addLocalPost(me, 2_000);
    const tieB = t.seed.addLocalPost(me, 2_000);
    const reply = t.seed.addLocalPost(me, 3_000, { inReplyToUri: 'https://remote.example/notes/other' });
    const note = t.seed.addRemotePost(alice, 3_500);
    const boost = t.seed.addRepost(me.actorId, note.postId, 4_000);
    t.seed.addLocalPost(me, 5_000, { deletedAt: 6_000 });
    const aliceFirst = t.seed.addRemotePost(alice, 1_000);
    const aliceSecond = t.seed.addRemotePost(alice, 2_000);
    const aliceReply = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: first.uri });
    t.seed.addRepost(alice.actorId, first.postId, 4_000);
    const newestFirst = [boost.repostId, reply.postId, tieB.postId, tieA.postId, media.postId, first.postId];
    return {
      ...t,
      me,
      alice,
      first,
      media,
      tieA,
      tieB,
      reply,
      note,
      boost,
      aliceFirst,
      aliceSecond,
      aliceReply,
      newestFirst,
    };
  };

  const statusIds = async (response: Response) => idsOf(await response.json());

  it('ローカルのアカウントの投稿とブーストを新しい順に返し、削除済みを除く', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`);

    expect(response.status).toBe(200);
    const statuses = parseStatuses(await response.json());
    expect(statuses.map((status) => status.id)).toEqual(t.newestFirst);
    expect(statuses[0]).toMatchObject({
      account: { id: t.me.actorId, username: 'kosui' },
      reblog: { id: t.note.postId, account: { id: t.alice.actorId } },
      content: '',
    });
    expect(statuses[1]).toMatchObject({ id: t.reply.postId, account: { id: t.me.actorId } });
  });

  it('Bearer の利用者に自分の操作の状態を付ける', async () => {
    const t = await seedAccounts();
    t.seed.addLike(t.me.actorId, t.first.postId);

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`, { headers: t.me.bearer });

    const own = parseStatuses(await response.json());
    expect(own.find((status) => status.id === t.first.postId)).toMatchObject({ favourited: true });
  });

  it('exclude_reblogs=true はブーストを除く', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?exclude_reblogs=true`);

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(1));
  });

  it('exclude_replies=true は返信を除き、ブーストは残す', async () => {
    const t = await seedAccounts();

    const [mine, alices] = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?exclude_replies=true`),
      t.request(`/api/v1/accounts/${t.alice.actorId}/statuses?exclude_replies=true`),
    ]);

    expect(await statusIds(mine)).toEqual(t.newestFirst.filter((id) => id !== t.reply.postId));
    expect(await statusIds(alices)).toEqual([t.note.postId, t.aliceSecond.postId, t.aliceFirst.postId]);
  });

  it('only_media=true は画像のある投稿だけを返す', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?only_media=true`);

    const statuses = parseStatuses(await response.json());
    expect(statuses.map((status) => status.id)).toEqual([t.media.postId]);
    expect(statuses[0]?.media_attachments).toHaveLength(1);
  });

  it('リモートのアカウントは保存している投稿だけを返し、ブーストを含めない', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses`);

    expect(await statusIds(response)).toEqual([
      t.note.postId,
      t.aliceReply.postId,
      t.aliceSecond.postId,
      t.aliceFirst.postId,
    ]);
  });

  it('pinned=true と tagged の指定は空配列を返し、Link を付けない', async () => {
    const t = await seedAccounts();

    const responses = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?pinned=true`),
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?tagged=iori`),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect(response.headers.get('Link')).toBeNull();
    }
  });

  it('pinned=false と空の tagged は絞り込まない', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?pinned=false&tagged=`);

    expect(await statusIds(response)).toEqual(t.newestFirst);
  });

  it('limit と max_id と Link ヘッダーでページを送る', async () => {
    const t = await seedAccounts();

    const first = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?limit=2`);
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`);
    const secondNext = linkOf(second, 'next');
    const third = await t.request(`${secondNext?.pathname}${secondNext?.search}`);

    expect(await statusIds(first)).toEqual(t.newestFirst.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.reply.postId);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.boost.repostId);
    expect(await statusIds(second)).toEqual(t.newestFirst.slice(2, 4));
    expect(await statusIds(third)).toEqual(t.newestFirst.slice(4));
  });

  it('同じ時刻の投稿を (createdAt, id) の順で区切る', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?max_id=${t.tieB.postId}`);

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(3));
  });

  it('ブーストの id も max_id に使える', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?max_id=${t.boost.repostId}`);

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(1));
  });

  it('min_id は直後の投稿を取り、新しい順に返す', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?min_id=${t.first.postId}&limit=2`);

    expect(await statusIds(response)).toEqual([t.tieA.postId, t.media.postId]);
    expect(linkOf(response, 'prev')?.searchParams.get('min_id')).toBe(t.tieA.postId);
    expect(linkOf(response, 'next')?.searchParams.get('max_id')).toBe(t.media.postId);
  });

  it('since_id は新しい側から返す', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?since_id=${t.media.postId}&limit=2`);

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(0, 2));
  });

  it('limit は最大 40 に切る', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    for (let n = 0; n < 45; n++) t.seed.addLocalPost(me, 1_000 + n);

    const [capped, defaulted] = await Promise.all([
      t.request(`/api/v1/accounts/${me.actorId}/statuses?limit=100`),
      t.request(`/api/v1/accounts/${me.actorId}/statuses`),
    ]);

    expect(await statusIds(capped)).toHaveLength(40);
    expect(await statusIds(defaulted)).toHaveLength(20);
  });

  it('投稿のないアカウントは空配列を返し、存在しないアカウントと不正な ID は 404 にする', async () => {
    const t = setupReadApi();
    const lonely = t.seed.addRemoteActor('lonely');

    const [empty, missing, invalid] = await Promise.all([
      t.request(`/api/v1/accounts/${lonely.actorId}/statuses`),
      t.request(`/api/v1/accounts/${t.seed.uuid()}/statuses`),
      t.request('/api/v1/accounts/not-an-id/statuses'),
    ]);

    expect(await empty.json()).toEqual([]);
    expect(empty.headers.get('Link')).toBeNull();
    expect([missing.status, invalid.status]).toEqual([404, 404]);
    expect(await missing.json()).toEqual({ error: 'Record not found' });
  });
});

describe('アカウントのルーターの登録順', () => {
  it('固定パスを :id に取らせない', async () => {
    const harness = createOAuthHarness();
    const authn = createMastodonAuthn({
      verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
      sessionResolver: harness.memory.sessionResolver as never,
    });
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (root) => {
        root.route(
          '/api',
          createWorkerMastodonAccountsRouter({
            authn,
            actorResolverByUserId: {} as never,
            accountStatusItemsResolverByActorId: {} as never,
            actorIdsResolverByFollowerId: {} as never,
            actorIdsResolverByFollowingId: {} as never,
            statusAssembler: { assemble: async () => [], assembleAccounts: async () => [] },
          }),
        );
        root.route(
          '/api',
          createWorkerMastodonCoreRouter({
            authn,
            userResolver: {} as never,
            userResolverByUsername: {} as never,
            actorResolverByUserId: {} as never,
            accountStatsResolver: {} as never,
            instance: {
              domain: 'iori.test',
              title: 'iori.test',
              description: 'A microblog by kosui',
              contactUsername: Username.orThrow('kosui'),
              vapidPublicKey: undefined,
            },
          }),
        );
        root.route('/api', createWorkerMastodonFallbackRouter());
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('og', { status: 200 }),
    });
    const { token } = await harness.issueUserToken('read:follows');

    const response = await app.request(`${ORIGIN}/api/v1/accounts/familiar_followers?id[]=a`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'a', accounts: [] }]);
  });
});
