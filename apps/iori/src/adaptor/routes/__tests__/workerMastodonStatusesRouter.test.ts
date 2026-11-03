import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const notFound = { error: 'Record not found' };

describe('GET /api/v1/statuses/:id', () => {
  const seedStatuses = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const note = t.seed.addRemotePost(alice, 1_000, { timeline: true });
    const boost = t.seed.addRepost(me.actorId, note.postId, 2_000);
    t.seed.addLike(me.actorId, note.postId);
    return { ...t, me, alice, note, boost };
  };

  it('未認証でも投稿を返し、状態は false にする', async () => {
    const t = await seedStatuses();

    const response = await t.request(`/api/v1/statuses/${t.note.postId}`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.note.postId,
      uri: t.note.uri,
      account: { id: t.alice.actorId },
      favourited: false,
      reblogged: false,
      reblog: null,
    });
  });

  it('Bearer と Cookie の利用者の状態を入れる', async () => {
    const t = await seedStatuses();

    const bearer = await t.request(`/api/v1/statuses/${t.note.postId}`, { headers: t.me.bearer });
    const cookie = await t.request(`/api/v1/statuses/${t.note.postId}`, {
      headers: { Cookie: `sessionId=${t.me.sessionId}` },
    });

    expect(StatusSchema.parse(await bearer.json())).toMatchObject({ favourited: true, reblogged: true });
    expect(StatusSchema.parse(await cookie.json())).toMatchObject({ favourited: true, reblogged: true });
  });

  it('repostId を渡すとブーストの Status を返す', async () => {
    const t = await seedStatuses();

    const response = await t.request(`/api/v1/statuses/${t.boost.repostId}`, { headers: t.me.bearer });

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.boost.repostId,
      created_at: '1970-01-01T00:00:02.000Z',
      account: { id: t.me.actorId },
      reblog: { id: t.note.postId, favourited: true },
    });
  });

  it('見つからない、削除済み、ID の形が不正なときは 404 にする', async () => {
    const t = await seedStatuses();
    const deleted = t.seed.addLocalPost(t.me, 3_000, { deletedAt: 4_000 });

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${t.seed.uuid()}`),
      t.request(`/api/v1/statuses/${deleted.postId}`),
      t.request('/api/v1/statuses/not-an-id'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
  });

  it('不正な Bearer は 401 にする', async () => {
    const t = await seedStatuses();

    const response = await t.request(`/api/v1/statuses/${t.note.postId}`, {
      headers: { Authorization: 'Bearer invalid' },
    });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/statuses/:id/context', () => {
  it('祖先を根から順に、子孫を古い順に返し、削除済みを除く', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000);
    const mid = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    const late = t.seed.addRemotePost(alice, 5_000, { inReplyToUri: mid.uri });
    const early = t.seed.addLocalPost(me, 3_000, { inReplyToUri: mid.uri });
    t.seed.addLocalPost(me, 4_000, { inReplyToUri: mid.uri, deletedAt: 4_500 });
    t.seed.addLike(me.actorId, late.postId);

    const response = await t.request(`/api/v1/statuses/${mid.postId}/context`, { headers: me.bearer });

    expect(response.status).toBe(200);
    const body = await response.json() as { ancestors: unknown[]; descendants: unknown[] };
    const ancestors = body.ancestors.map((item) => StatusSchema.parse(item));
    const descendants = body.descendants.map((item) => StatusSchema.parse(item));
    expect(ancestors.map((status) => status.id)).toEqual([root.postId]);
    expect(descendants.map((status) => status.id)).toEqual([early.postId, late.postId]);
    expect(descendants[1]).toMatchObject({ favourited: true, in_reply_to_id: mid.postId });
  });

  it('未認証でも返し、見つからなければ 404 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const post = t.seed.addLocalPost(me, 1_000);

    const [found, missing] = await Promise.all([
      t.request(`/api/v1/statuses/${post.postId}/context`),
      t.request(`/api/v1/statuses/${t.seed.uuid()}/context`),
    ]);

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ ancestors: [], descendants: [] });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual(notFound);
  });
});
