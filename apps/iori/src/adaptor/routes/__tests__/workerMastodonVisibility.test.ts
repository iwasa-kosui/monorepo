import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import { GetTimelineUseCase } from '../../../useCase/getTimeline.ts';
import { createD1ActorResolverByUserId } from '../../d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../../d1/actor/actorsResolverByFollowerId.ts';
import { createD1ActorsResolverByFollowingId } from '../../d1/actor/actorsResolverByFollowingId.ts';
import { createD1MutedActorIdsResolverByUserId } from '../../d1/mute/mutedActorIdsResolverByUserId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../../d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1UserResolver } from '../../d1/user/userResolver.ts';
import { StatusSchema } from '../../mastodon/entities.ts';
import { createWorkerTimelinePostingApiRouter } from '../workerTimelinePostingApiRouter.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

const kosuiUri = 'https://iori.test/users/kosui';

const seedViewer = async () => {
  const t = setupReadApi();
  const me = await t.signIn();
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob');
  const relay = t.seed.addRelay();
  const remote = (
    actor: { actorId: string },
    createdAt: number,
    options: Parameters<typeof t.seed.addRemotePost>[2] = {},
  ) => {
    const post = t.seed.addRemotePost(actor, createdAt, { timeline: true, ...options });
    t.seed.addFederatedItem(post.postId, relay, createdAt);
    return post;
  };
  return { ...t, me, alice, bob, remote };
};

describe('ログイン中の閲覧者に宛先外の private と direct のリモートの投稿を返さない', () => {
  it('home は宛先外の direct とフォローしていない private を除き、宛先の direct を返す', async () => {
    const t = await seedViewer();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    t.seed.addFollow(t.me.actorId, t.bob.actorId);
    const publicNote = t.remote(t.alice, 1_000, { visibility: 'public' });
    t.remote(t.alice, 2_000, { visibility: 'direct' });
    const toMe = t.remote(t.alice, 3_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    const privateNote = t.remote(t.bob, 4_000, { visibility: 'private' });

    const response = await t.request('/api/v1/timelines/home', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([privateNote.postId, toMe.postId, publicNote.postId]);
  });

  it('GET /api/v1/home はフォロー中の相手が別の人に宛てた direct を除き、宛先の direct を返す', async () => {
    const t = await seedViewer();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const publicNote = t.remote(t.alice, 1_000, { visibility: 'public' });
    t.remote(t.alice, 2_000, { visibility: 'direct' });
    const toMe = t.remote(t.alice, 3_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerTimelinePostingApiRouter({
            getTimelineUseCase: GetTimelineUseCase.create({
              sessionResolver: t.memory.sessionResolver as never,
              userResolver: createD1UserResolver(t.db),
              actorResolverByUserId: createD1ActorResolverByUserId(t.db),
              timelineItemsResolverByActorIds: createD1TimelineItemsResolverByActorIds(t.db),
              actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(t.db),
              actorsResolverByFollowingId: createD1ActorsResolverByFollowingId(t.db),
              mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(t.db),
            }),
            createPostUseCase: {
              run: async () => {
                throw new Error('unused');
              },
            },
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const response = await app.request('https://iori.test/api/v1/home', {
      headers: { Cookie: `sessionId=${t.me.sessionId}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { timelineItems: Array<{ post: { postId: string } }> };
    expect(body.timelineItems.map((item) => item.post.postId)).toEqual([toMe.postId, publicNote.postId]);
  });

  it('home はフォローしていないアクターの private を返さない', async () => {
    const t = await seedViewer();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const carol = t.seed.addRemoteActor('carol');
    const publicNote = t.remote(t.alice, 1_000, { visibility: 'public' });
    const hidden = t.remote(carol, 2_000, { visibility: 'private' });
    t.seed.addRepost(t.alice.actorId, hidden.postId, 3_000);

    const response = await t.request('/api/v1/timelines/home', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([publicNote.postId]);
  });

  it('home は絞り込んでも 1 ページの件数を欠かさない', async () => {
    const t = await seedViewer();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const visible = [1_000, 2_000, 3_000].map((at) => t.remote(t.alice, at, { visibility: 'public' }));
    for (const at of [4_000, 5_000, 6_000]) t.remote(t.alice, at, { visibility: 'direct' });

    const response = await t.request('/api/v1/timelines/home?limit=3', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual(visible.map((post) => post.postId).reverse());
  });

  it('public の remote=true は宛先外の direct とフォローしていない private を除き、宛先の direct を返す', async () => {
    const t = await seedViewer();
    const publicNote = t.remote(t.alice, 1_000, { visibility: 'public' });
    t.remote(t.alice, 2_000, { visibility: 'direct' });
    t.remote(t.alice, 3_000, { visibility: 'private' });
    const toMe = t.remote(t.alice, 4_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    t.seed.addFollow(t.me.actorId, t.bob.actorId);
    const followedPrivate = t.remote(t.bob, 5_000, { visibility: 'private' });

    const response = await t.request('/api/v1/timelines/public?remote=true', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([followedPrivate.postId, toMe.postId, publicNote.postId]);
  });

  it('public の remote=true は絞り込んでも 1 ページの件数を欠かさない', async () => {
    const t = await seedViewer();
    const visible = [1_000, 2_000].map((at) => t.remote(t.alice, at, { visibility: 'unlisted' }));
    for (const at of [3_000, 4_000, 5_000]) t.remote(t.alice, at, { visibility: 'direct' });

    const response = await t.request('/api/v1/timelines/public?remote=true&limit=2', { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual(visible.map((post) => post.postId).reverse());
  });

  it('statuses/:id は宛先外の direct とフォローしていない private を 404 にし、宛先の direct を返す', async () => {
    const t = await seedViewer();
    const direct = t.remote(t.alice, 1_000, { visibility: 'direct' });
    const privateNote = t.remote(t.alice, 2_000, { visibility: 'private' });
    const legacy = t.remote(t.alice, 3_000);
    const toMe = t.remote(t.alice, 4_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    const toBob = t.remote(t.alice, 5_000, {
      visibility: 'direct',
      recipientActorUris: ['https://iori.test/users/bob'],
    });

    const responses = await Promise.all(
      [direct, privateNote, legacy, toMe, toBob].map((note) =>
        t.request(`/api/v1/statuses/${note.postId}`, { headers: t.me.bearer })
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 200, 404]);
    expect(StatusSchema.parse(await responses[3]!.json())).toMatchObject({ id: toMe.postId, visibility: 'direct' });
  });

  it('statuses/:id はフォロー中の相手の private と記録のない投稿を返す', async () => {
    const t = await seedViewer();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const privateNote = t.remote(t.alice, 1_000, { visibility: 'private' });
    const legacy = t.remote(t.alice, 2_000);

    const responses = await Promise.all(
      [privateNote, legacy].map((note) => t.request(`/api/v1/statuses/${note.postId}`, { headers: t.me.bearer })),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });

  it('statuses/:id は見えない投稿のブーストを 404 にする', async () => {
    const t = await seedViewer();
    const direct = t.remote(t.alice, 1_000, { visibility: 'direct' });
    const boost = t.seed.addRepost(t.bob.actorId, direct.postId, 2_000);

    const response = await t.request(`/api/v1/statuses/${boost.repostId}`, { headers: t.me.bearer });

    expect(response.status).toBe(404);
  });

  it('context は見えない祖先と子孫を除き、見えない起点を 404 にする', async () => {
    const t = await seedViewer();
    const root = t.remote(t.alice, 1_000, { visibility: 'direct' });
    const mid = t.seed.addLocalPost(t.me, 2_000, { inReplyToUri: root.uri });
    const hiddenChild = t.remote(t.alice, 3_000, { inReplyToUri: mid.uri, visibility: 'direct' });
    const toMeChild = t.remote(t.alice, 4_000, {
      inReplyToUri: mid.uri,
      visibility: 'direct',
      recipientActorUris: [kosuiUri],
    });
    const publicChild = t.remote(t.alice, 5_000, { inReplyToUri: mid.uri, visibility: 'public' });

    const [context, hidden] = await Promise.all([
      t.request(`/api/v1/statuses/${mid.postId}/context`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${hiddenChild.postId}/context`, { headers: t.me.bearer }),
    ]);

    const body = await context.json() as { ancestors: unknown[]; descendants: unknown[] };
    expect(body.ancestors).toEqual([]);
    expect(idsOf(body.descendants)).toEqual([toMeChild.postId, publicChild.postId]);
    expect(hidden.status).toBe(404);
  });

  it('accounts/:id/statuses は宛先外の direct とフォローしていない private を除き、宛先の direct を返す', async () => {
    const t = await seedViewer();
    const publicNote = t.remote(t.alice, 1_000, { visibility: 'public' });
    t.remote(t.alice, 2_000, { visibility: 'direct' });
    t.remote(t.alice, 3_000, { visibility: 'private' });
    t.remote(t.alice, 4_000);
    const toMe = t.remote(t.alice, 5_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });

    const response = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses`, { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([toMe.postId, publicNote.postId]);
  });

  it('accounts/:id/statuses は見えない投稿のブーストを除く', async () => {
    const t = await seedViewer();
    const other = t.seed.addLocalActor('other');
    const visible = t.remote(t.bob, 1_000, { visibility: 'public' });
    const hidden = t.remote(t.bob, 2_000, { visibility: 'direct' });
    const visibleBoost = t.seed.addRepost(other.actorId, visible.postId, 3_000);
    t.seed.addRepost(other.actorId, hidden.postId, 4_000);

    const response = await t.request(`/api/v1/accounts/${other.actorId}/statuses`, { headers: t.me.bearer });

    expect(idsOf(await response.json())).toEqual([visibleBoost.repostId]);
  });

  it('accounts/:id/statuses は絞り込んでも 1 ページの件数を欠かさない', async () => {
    const t = await seedViewer();
    const visible = [1_000, 2_000].map((at) => t.remote(t.alice, at, { visibility: 'public' }));
    for (const at of [3_000, 4_000, 5_000]) t.remote(t.alice, at, { visibility: 'direct' });

    const response = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses?limit=2`, {
      headers: t.me.bearer,
    });

    expect(idsOf(await response.json())).toEqual(visible.map((post) => post.postId).reverse());
  });

  it('notifications は宛先外の direct への通知を一覧から除き、:id は 404 にし、宛先の direct への通知は返す', async () => {
    const t = await seedViewer();
    const direct = t.remote(t.alice, 1_000, { visibility: 'direct' });
    const toMe = t.remote(t.alice, 2_000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    const hidden = t.seed.addLikeNotification(t.me.userId, t.alice.actorId, direct.postId, 3_000);
    const shown = t.seed.addLikeNotification(t.me.userId, t.alice.actorId, toMe.postId, 4_000);

    const [list, hiddenOne, shownOne] = await Promise.all([
      t.request('/api/v1/notifications', { headers: t.me.bearer }),
      t.request(`/api/v1/notifications/${hidden}`, { headers: t.me.bearer }),
      t.request(`/api/v1/notifications/${shown}`, { headers: t.me.bearer }),
    ]);

    const body = await list.json() as Array<{ status?: { id: string } }>;
    expect(body.map((notification) => notification.status?.id)).toEqual([toMe.postId]);
    expect(hiddenOne.status).toBe(404);
    expect(shownOne.status).toBe(200);
  });

  it('notifications は宛先外の投稿の通知を除いても Link ヘッダーの位置は除く前の行で作る', async () => {
    const t = await seedViewer();
    const direct = t.remote(t.alice, 1_000, { visibility: 'direct' });
    const publicNote = t.remote(t.alice, 2_000, { visibility: 'public' });
    t.seed.addLikeNotification(t.me.userId, t.alice.actorId, publicNote.postId, 3_000);
    const hidden = t.seed.addLikeNotification(t.me.userId, t.alice.actorId, direct.postId, 4_000);

    const response = await t.request('/api/v1/notifications?limit=1', { headers: t.me.bearer });

    expect(await response.json()).toEqual([]);
    expect(linkOf(response, 'next')?.searchParams.get('max_id')).toBe(hidden);
  });
});
