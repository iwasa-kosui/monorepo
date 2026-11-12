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

  describe('投票', () => {
    const addPoll = (t: Awaited<ReturnType<typeof seedStatuses>>, postId: string, closed = 0) =>
      t.sqlite.prepare(
        'INSERT INTO remote_post_polls(postId,multiple,options,votersCount,expiresAt,closed) VALUES (?,?,?,?,?,?)',
      ).run(
        postId,
        0,
        JSON.stringify([{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 1 }]),
        4,
        4_000_000_000_000,
        closed,
      );

    it('保存した投票を poll に入れる', async () => {
      const t = await seedStatuses();
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addPoll(t, post.postId);

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      expect(StatusSchema.parse(await response.json()).poll).toEqual({
        id: post.postId,
        expires_at: new Date(4_000_000_000_000).toISOString(),
        expired: false,
        multiple: false,
        votes_count: 4,
        voters_count: 4,
        options: [{ title: '赤', votes_count: 3 }, { title: '青', votes_count: 1 }],
        emojis: [],
        voted: false,
        own_votes: [],
      });
    });

    it('closed の投票は expired にする', async () => {
      const t = await seedStatuses();
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addPoll(t, post.postId, 1);

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      expect(StatusSchema.parse(await response.json()).poll?.expired).toBe(true);
    });

    it('投票の無い投稿は poll を null にする', async () => {
      const t = await seedStatuses();
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      expect(StatusSchema.parse(await response.json()).poll).toBeNull();
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

    it('引用先がローカルの投稿でも quote に入れる', async () => {
      const t = await seedStatuses();
      const quoted = t.seed.addLocalPost(t.me, 3_000);
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);

      const response = await t.request(`/api/v1/statuses/${post.postId}`);

      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toMatchObject({ state: 'accepted', quoted_status: { id: quoted.postId } });
    });

    it('引用先が未取得のとき quote を null にして iori.quote_url に URI を載せる', async () => {
      const t = await seedStatuses();
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addQuote(t, post.postId, 'https://other.example/notes/unknown');

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toBeNull();
      expect(status.iori?.quote_url).toBe('https://other.example/notes/unknown');
    });

    it('未認証では見えない引用先を quote に入れず、URI だけ iori.quote_url に載せる', async () => {
      const t = await seedStatuses();
      const hidden = t.seed.addRemotePost(t.alice, 3_000, { visibility: 'private' });
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addQuote(t, post.postId, hidden.uri);

      const response = await t.request(`/api/v1/statuses/${post.postId}`);

      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toBeNull();
      expect(status.iori?.quote_url).toBe(hidden.uri);
    });

    it.each(['mute', 'block'] as const)(
      '閲覧者が%sした相手の引用先は quote を null にして iori.quote_url に URI を載せる',
      async (kind) => {
        const t = await seedStatuses();
        const bob = t.seed.addRemoteActor('bob');
        if (kind === 'mute') t.seed.addMute(t.me.userId, bob.actorId);
        else t.seed.addBlock(t.me.userId, bob.actorId);
        const quoted = t.seed.addRemotePost(bob, 3_000, { visibility: 'public' });
        const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
        addQuote(t, post.postId, quoted.uri);

        const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

        const status = StatusSchema.parse(await response.json());
        expect(status.quote).toBeNull();
        expect(status.iori?.quote_url).toBe(quoted.uri);
      },
    );

    it('引用が無い投稿は quote を null にし、quote_url を出さない', async () => {
      const t = await seedStatuses();
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });

      const response = await t.request(`/api/v1/statuses/${post.postId}`, { headers: t.me.bearer });

      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toBeNull();
      expect(status.iori).not.toHaveProperty('quote_url');
    });

    it('ブーストされた投稿の引用を reblog の中に載せる', async () => {
      const t = await seedStatuses();
      const quoted = t.seed.addRemotePost(t.alice, 3_000, { visibility: 'public' });
      const post = t.seed.addRemotePost(t.alice, 3_100, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);
      const boost = t.seed.addRepost(t.me.actorId, post.postId, 4_000);

      const response = await t.request(`/api/v1/statuses/${boost.repostId}`, { headers: t.me.bearer });

      const status = StatusSchema.parse(await response.json());
      expect(status.quote).toBeNull();
      expect(status.reblog?.quote).toMatchObject({ state: 'accepted', quoted_status: { id: quoted.postId } });
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

  it('ログインするとフォロー中の相手の private と記録のないリモートの投稿を返し、visibility を記録の値にする', async () => {
    const t = await seedStatuses();
    const privateNote = t.seed.addRemotePost(t.alice, 3_000, { visibility: 'private' });

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${privateNote.postId}`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${t.note.postId}`, { headers: t.me.bearer }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const statuses = await Promise.all(responses.map(async (response) => StatusSchema.parse(await response.json())));
    expect(statuses.map((status) => status.visibility)).toEqual(['private', 'private']);
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

  it('ミュートした相手の祖先と子孫を除き、起点がミュートした相手でも 404 にしない', async () => {
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
    t.seed.addMute(me.userId, alice.actorId);

    const response = await t.request(`/api/v1/statuses/${mid.postId}/context`, { headers: me.bearer });
    const mutedFocus = await t.request(`/api/v1/statuses/${fromAlice.postId}/context`, { headers: me.bearer });

    expect(response.status).toBe(200);
    const body = await response.json() as { ancestors: unknown[]; descendants: unknown[] };
    expect(body.ancestors).toEqual([]);
    expect(body.descendants.map((item) => StatusSchema.parse(item).id)).toEqual([fromMe.postId]);
    expect(mutedFocus.status).toBe(200);
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

  it('行が無いときはフィールドを出さない', async () => {
    const t = await setup();

    expect(await t.crosspostOf(t.me.bearer)).toBeUndefined();
  });

  it('リモートの投稿には載せない', async () => {
    const t = await setup();
    const alice = t.seed.addRemoteActor('alice');
    const note = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
    t.sqlite.prepare('INSERT INTO bluesky_crossposts(postId,status,createdAt,updatedAt) VALUES (?,?,?,?)').run(
      note.postId,
      'pending',
      1_000,
      1_000,
    );

    const response = await t.request(`/api/v1/statuses/${note.postId}`, { headers: t.me.bearer });

    expect(StatusSchema.parse(await response.json()).iori?.bluesky_crosspost).toBeUndefined();
  });

  it('failed で試行が上限に達していれば retrying を false にする', async () => {
    const t = await setup({ status: 'failed', attempts: 3 });

    expect(await t.crosspostOf(t.me.bearer)).toMatchObject({ status: 'failed', retrying: false });
  });

  it('failed で試行が上限未満なら retrying を true にする', async () => {
    const t = await setup({ status: 'failed', attempts: 2 });

    expect(await t.crosspostOf(t.me.bearer)).toMatchObject({ status: 'failed', retrying: true });
  });

  it('sent なら bsky.app の投稿の URL を載せる', async () => {
    const t = await setup({ status: 'sent', uri: 'at://did:plc:abc123/app.bsky.feed.post/3kxyz' });

    expect(await t.crosspostOf(t.me.bearer)).toEqual({
      status: 'sent',
      skip_reason: null,
      retrying: false,
      url: 'https://bsky.app/profile/did:plc:abc123/post/3kxyz',
    });
  });

  it('skipped なら理由を載せる', async () => {
    const t = await setup({ status: 'skipped', skipReason: 'content_warning' });

    expect(await t.crosspostOf(t.me.bearer)).toEqual({
      status: 'skipped',
      skip_reason: 'content_warning',
      retrying: false,
      url: null,
    });
  });
});
