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

  it('未認証でもローカルの投稿を返し、状態は false にする', async () => {
    const t = await seedStatuses();
    const local = t.seed.addLocalPost(t.me, 3_000);
    t.seed.addLike(t.me.actorId, local.postId);

    const response = await t.request(`/api/v1/statuses/${local.postId}`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: local.postId,
      account: { id: t.me.actorId },
      favourited: false,
      reblogged: false,
      reblog: null,
    });
  });

  it('未認証では公開範囲の記録がないリモートの投稿と、そのブーストを 404 にする', async () => {
    const t = await seedStatuses();

    const [note, boost] = await Promise.all([
      t.request(`/api/v1/statuses/${t.note.postId}`),
      t.request(`/api/v1/statuses/${t.boost.repostId}`),
    ]);

    expect([note.status, boost.status]).toEqual([404, 404]);
    expect(await note.json()).toEqual(notFound);
    expect(await boost.json()).toEqual(notFound);
  });

  it('未認証では public と unlisted のリモートの投稿とそのブーストだけを返し、private と direct は 404 にする', async () => {
    const t = await seedStatuses();
    const posts = {
      public: t.seed.addRemotePost(t.alice, 3_000, { visibility: 'public' }),
      unlisted: t.seed.addRemotePost(t.alice, 3_100, { visibility: 'unlisted' }),
      private: t.seed.addRemotePost(t.alice, 3_200, { visibility: 'private' }),
      direct: t.seed.addRemotePost(t.alice, 3_300, { visibility: 'direct' }),
    };
    const boosts = {
      public: t.seed.addRepost(t.me.actorId, posts.public.postId, 4_000),
      private: t.seed.addRepost(t.me.actorId, posts.private.postId, 4_100),
    };

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${posts.public.postId}`),
      t.request(`/api/v1/statuses/${posts.unlisted.postId}`),
      t.request(`/api/v1/statuses/${posts.private.postId}`),
      t.request(`/api/v1/statuses/${posts.direct.postId}`),
      t.request(`/api/v1/statuses/${boosts.public.repostId}`),
      t.request(`/api/v1/statuses/${boosts.private.repostId}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 404, 404, 200, 404]);
    expect(StatusSchema.parse(await responses[0]!.json())).toMatchObject({ visibility: 'public' });
    expect(StatusSchema.parse(await responses[1]!.json())).toMatchObject({ visibility: 'unlisted' });
  });

  it('ログインすると private と direct と記録のないリモートの投稿も返し、visibility を記録の値にする', async () => {
    const t = await seedStatuses();
    const privateNote = t.seed.addRemotePost(t.alice, 3_000, { visibility: 'private' });
    const directNote = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'direct' });

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${privateNote.postId}`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${directNote.postId}`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${t.note.postId}`, { headers: t.me.bearer }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const statuses = await Promise.all(responses.map(async (response) => StatusSchema.parse(await response.json())));
    expect(statuses.map((status) => status.visibility)).toEqual(['private', 'direct', 'private']);
  });

  it('userId のないアプリトークンは未認証として扱い、リモートの投稿を 404 にする', async () => {
    const t = await seedStatuses();
    const { token } = await t.issueAppToken('read');

    const response = await t.request(`/api/v1/statuses/${t.note.postId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
  });

  it('ログインするとリモートの投稿を返し、スコープが足りないトークンは 403 にする', async () => {
    const t = await seedStatuses();
    const writeOnly = await t.bearerFor('write');

    const [logged, forbidden] = await Promise.all([
      t.request(`/api/v1/statuses/${t.note.postId}`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${t.note.postId}`, { headers: writeOnly }),
    ]);

    expect(logged.status).toBe(200);
    expect(StatusSchema.parse(await logged.json())).toMatchObject({ id: t.note.postId, uri: t.note.uri });
    expect(forbidden.status).toBe(403);
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

  it('未認証では public と unlisted のリモートの投稿だけを祖先と子孫に含め、起点が private なら 404 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const mid = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    const unlisted = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: mid.uri, visibility: 'unlisted' });
    t.seed.addRemotePost(alice, 3_100, { inReplyToUri: mid.uri, visibility: 'private' });
    t.seed.addRemotePost(alice, 3_200, { inReplyToUri: mid.uri, visibility: 'direct' });
    t.seed.addRemotePost(alice, 3_300, { inReplyToUri: mid.uri });
    const hiddenRoot = t.seed.addRemotePost(alice, 4_000, { visibility: 'private' });

    const [anonymous, loggedIn, hidden] = await Promise.all([
      t.request(`/api/v1/statuses/${mid.postId}/context`),
      t.request(`/api/v1/statuses/${mid.postId}/context`, { headers: me.bearer }),
      t.request(`/api/v1/statuses/${hiddenRoot.postId}/context`),
    ]);

    const idsIn = async (response: Response) => {
      const body = await response.json() as { ancestors: unknown[]; descendants: unknown[] };
      return [
        body.ancestors.map((item) => StatusSchema.parse(item).id),
        body.descendants.map((item) => StatusSchema.parse(item).id),
      ];
    };
    expect(await idsIn(anonymous)).toEqual([[root.postId], [unlisted.postId]]);
    expect((await idsIn(loggedIn))[1]).toHaveLength(4);
    expect(hidden.status).toBe(404);
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
