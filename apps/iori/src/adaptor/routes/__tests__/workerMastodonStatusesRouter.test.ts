import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const notFound = { error: 'Record not found' };

describe('GET /api/v1/statuses/:id', () => {
  const seedStatuses = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(me.actorId, alice.actorId);
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

  describe('引用', () => {
    const addQuote = (t: Awaited<ReturnType<typeof seedStatuses>>, postId: string, quoteUri: string) =>
      t.sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)').run(postId, quoteUri);

    it('引用先が見えるときは quote に引用先の Status を入れ、その中の quote は null にする', async () => {
      const t = await seedStatuses();
      const quoted = t.seed.addRemotePost(t.alice, 3_000, { visibility: 'public' });
      const quotedQuoted = t.seed.addRemotePost(t.alice, 2_900, { visibility: 'public' });
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);
      addQuote(t, quoted.postId, quotedQuoted.uri);

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toMatchObject({ state: 'accepted', quoted_status: { id: quoted.postId, quote: null } });
      expect(status.iori).not.toHaveProperty('quote_url');
    });
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
});

describe('GET /api/v1/statuses/:id/context', () => {
  it('祖先を根から順に、子孫を古い順に返し、削除済みを除く', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(me.actorId, alice.actorId);
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

  it('ブロックした相手の祖先と子孫を除き、起点がブロックした相手でも 404 にしない', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    t.seed.addFollow(me.actorId, alice.actorId);
    t.seed.addFollow(me.actorId, bob.actorId);
    const root = t.seed.addRemotePost(alice, 1_000);
    const mid = t.seed.addRemotePost(bob, 2_000, { inReplyToUri: root.uri });
    const fromAlice = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: mid.uri });
    const fromMe = t.seed.addLocalPost(me, 4_000, { inReplyToUri: mid.uri });
    t.seed.addBlock(me.userId, alice.actorId);

    const response = await t.request(`/api/v1/statuses/${mid.postId}/context`, { headers: me.bearer });
    const blockedFocus = await t.request(`/api/v1/statuses/${fromAlice.postId}/context`, { headers: me.bearer });

    expect(response.status).toBe(200);
    const body = await response.json() as { ancestors: unknown[]; descendants: unknown[] };
    expect(body.ancestors).toEqual([]);
    expect(body.descendants.map((item) => StatusSchema.parse(item).id)).toEqual([fromMe.postId]);
    expect(blockedFocus.status).toBe(200);
  });

  it('未認証では public と unlisted のリモートの投稿だけを祖先と子孫に含め、起点が private なら 404 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(me.actorId, alice.actorId);
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
    expect((await idsIn(loggedIn))[1]).toHaveLength(3);
    expect(hidden.status).toBe(404);
  });
});

describe('GET /api/v1/statuses/:id の iori.bluesky_crosspost', () => {
  type CrosspostRow = Readonly<{
    status: string;
    skipReason?: string | null;
    uri?: string | null;
    attempts?: number;
  }>;

  const setup = async (row?: CrosspostRow) => {
    const t = setupReadApi();
    const me = await t.signIn();
    const post = t.seed.addLocalPost(me, 1_000);
    if (row !== undefined) {
      t.sqlite.prepare(
        'INSERT INTO bluesky_crossposts(postId,status,skipReason,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
      ).run(post.postId, row.status, row.skipReason ?? null, row.uri ?? null, row.attempts ?? 0, 1_000, 1_000);
    }
    const crosspostOf = async (headers?: Record<string, string>) => {
      const response = await t.request(`/api/v1/statuses/${post.postId}`, headers === undefined ? {} : { headers });
      expect(response.status).toBe(200);
      return StatusSchema.parse(await response.json()).iori?.bluesky_crosspost;
    };
    return { ...t, me, post, crosspostOf };
  };

  it('作者本人にだけ載せ、未認証と他のユーザーには載せない', async () => {
    const t = await setup({ status: 'pending' });
    const issued = await t.issueUserToken('read');
    t.seed.addLocalActor('bob', issued.userId);

    expect(await t.crosspostOf(t.me.bearer)).toEqual({
      status: 'pending',
      skip_reason: null,
      retrying: true,
      url: null,
    });
    expect(await t.crosspostOf()).toBeUndefined();
    expect(await t.crosspostOf({ Authorization: `Bearer ${issued.token}` })).toBeUndefined();
  });
});
