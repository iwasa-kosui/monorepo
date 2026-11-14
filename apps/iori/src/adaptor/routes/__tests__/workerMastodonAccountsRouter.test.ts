import { describe, expect, it } from 'vitest';

import { AccountSchema, RelationshipSchema, StatusSchema } from '../../mastodon/entities.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

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

  it('ユーザーのトークンは read:accounts を求め、Cookie は通す', async () => {
    const t = await seedFollows();
    const statusesOnly = await t.bearerFor('read:statuses');

    const [forbidden, cookie, account] = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/followers`, { headers: statusesOnly }),
      t.request(`/api/v1/accounts/${t.me.actorId}/followers`, { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
      t.request(`/api/v1/accounts/${t.me.actorId}`, { headers: statusesOnly }),
    ]);

    expect([forbidden.status, cookie.status, account.status]).toEqual([403, 200, 403]);
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
});

describe('GET /api/v1/accounts', () => {
  it('複数の id[] を指定すると Account の配列を入力順で返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');

    const response = await t.request(
      `/api/v1/accounts?id[]=${bob.actorId}&id[]=${me.actorId}&id[]=${alice.actorId}`,
    );

    expect(response.status).toBe(200);
    const accounts = ((await response.json()) as unknown[]).map((item) => AccountSchema.parse(item));
    expect(accounts.map((account) => account.id)).toEqual([bob.actorId, me.actorId, alice.actorId]);
    expect(accounts.map((account) => account.acct)).toEqual(['bob@remote.example', 'kosui', 'alice@remote.example']);
  });

  it('41 件の異なる ID を指定すると 422 にする', async () => {
    const t = setupReadApi();
    const query = Array.from({ length: 41 }, () => `id[]=${t.seed.uuid()}`).join('&');

    const response = await t.request(`/api/v1/accounts?${query}`);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Too many accounts requested' });
  });
});

describe('GET /api/v1/accounts/lookup', () => {
  const lookup = (t: ReturnType<typeof setupReadApi>, acct: string, init?: RequestInit) =>
    t.request(`/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, init);

  it('username と @username と自分のドメインの host 付きでローカルのアカウントを未認証で返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn();

    const responses = await Promise.all(
      ['kosui', '@kosui', 'kosui@iori.test', '@kosui@IORI.test'].map((acct) => lookup(t, acct)),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(AccountSchema.parse(await response.json())).toMatchObject({
        id: me.actorId,
        username: 'kosui',
        acct: 'kosui',
      });
    }
  });

  it('リモートのアカウントを username と host で引く', async () => {
    const t = setupReadApi();
    const alice = t.seed.addRemoteActor('alice');
    const otherAlice = t.seed.addRemoteActor('alice', 'other.example');

    const [first, second, withAt] = await Promise.all([
      lookup(t, 'alice@remote.example'),
      lookup(t, 'alice@other.example'),
      lookup(t, '@alice@remote.example'),
    ]);

    expect(AccountSchema.parse(await first.json())).toMatchObject({ id: alice.actorId, acct: 'alice@remote.example' });
    expect(AccountSchema.parse(await second.json())).toMatchObject({
      id: otherAlice.actorId,
      acct: 'alice@other.example',
    });
    expect(AccountSchema.parse(await withAt.json()).id).toBe(alice.actorId);
  });

  it('見つからない acct は 404 にする', async () => {
    const t = setupReadApi();
    await t.signIn();
    t.seed.addRemoteActor('alice');

    const responses = await Promise.all([
      lookup(t, 'nobody'),
      lookup(t, 'alice'),
      lookup(t, 'alice@other.example'),
      lookup(t, 'nobody@iori.test'),
      lookup(t, 'kosui@remote.example'),
      lookup(t, 'a@b@c'),
      lookup(t, 'alice@'),
      lookup(t, '@'),
      lookup(t, ''),
      t.request('/api/v1/accounts/lookup'),
    ]);

    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(404));
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });
});

describe('GET /api/v1/accounts/relationships', () => {
  const seedRelationships = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    const carol = t.seed.addRemoteActor('carol');
    const dave = t.seed.addRemoteActor('dave');
    const other = t.seed.addLocalActor('other');
    t.seed.addFollow(me.actorId, alice.actorId);
    t.seed.addFollow(bob.actorId, me.actorId);
    t.seed.addFollow(me.actorId, carol.actorId);
    t.seed.addFollow(carol.actorId, me.actorId);
    t.seed.addMute(me.userId, dave.actorId);
    t.seed.addMute(other.userId, alice.actorId);
    t.seed.addFollow(other.actorId, bob.actorId);
    return { ...t, me, alice, bob, carol, dave, other };
  };

  const flagsOf = (body: unknown) =>
    (body as unknown[]).map((item) => {
      const { id, following, followed_by, muting } = RelationshipSchema.parse(item);
      return { id, following, followed_by, muting };
    });

  it('following と followed_by と muting を viewer から見て返す', async () => {
    const t = await seedRelationships();
    const query = [t.alice, t.bob, t.carol, t.dave].map((actor) => `id[]=${actor.actorId}`).join('&');

    const response = await t.request(`/api/v1/accounts/relationships?${query}`, { headers: t.me.bearer });

    expect(response.status).toBe(200);
    expect(flagsOf(await response.json())).toEqual([
      { id: t.alice.actorId, following: true, followed_by: false, muting: false },
      { id: t.bob.actorId, following: false, followed_by: true, muting: false },
      { id: t.carol.actorId, following: true, followed_by: true, muting: false },
      { id: t.dave.actorId, following: false, followed_by: false, muting: true },
    ]);
  });

  it('ID の数に関わらず D1 へのクエリ数を変えない', async () => {
    const t = await seedRelationships();
    const count = async (actors: ReadonlyArray<{ actorId: string }>) => {
      t.queries.length = 0;
      await t.request(`/api/v1/accounts/relationships?${actors.map((actor) => `id[]=${actor.actorId}`).join('&')}`, {
        headers: t.me.bearer,
      });
      return t.queries.length;
    };
    const many = Array.from({ length: 30 }, (_, n) => t.seed.addRemoteActor(`many${n}`));

    const single = await count([t.alice]);
    const all = await count([t.alice, t.bob, t.carol, t.dave, ...many]);

    expect(all).toBe(single);
  });

  it('認証がなければ 401、スコープが足りなければ 403 にし、Cookie は通す', async () => {
    const t = await seedRelationships();
    const accountsOnly = await t.bearerFor('read:accounts');
    const path = `/api/v1/accounts/relationships?id[]=${t.alice.actorId}`;

    const [anonymous, forbidden, cookie] = await Promise.all([
      t.request(path),
      t.request(path, { headers: accountsOnly }),
      t.request(path, { headers: { Cookie: `sessionId=${t.me.sessionId}` } }),
    ]);

    expect([anonymous.status, forbidden.status, cookie.status]).toEqual([401, 403, 200]);
  });
});

describe('GET /api/v1/accounts/:id/statuses', () => {
  const seedAccounts = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(me.actorId, alice.actorId);
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

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`, { headers: t.me.bearer });

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

  it('未認証ではリモートのアカウントの public と unlisted の投稿だけを返し、ログインするとフォロー中の相手の private も返す', async () => {
    const t = await seedAccounts();
    const publicNote = t.seed.addRemotePost(t.alice, 5_000, { visibility: 'public' });
    t.seed.addRemotePost(t.alice, 5_100, { visibility: 'private' });
    const unlistedNote = t.seed.addRemotePost(t.alice, 5_200, { visibility: 'unlisted' });
    t.seed.addRemotePost(t.alice, 5_300, { visibility: 'direct' });

    const anonymous = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses`);
    const loggedIn = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses`, { headers: t.me.bearer });

    const anonymousStatuses = parseStatuses(await anonymous.json());
    expect(anonymousStatuses.map((status) => [status.id, status.visibility])).toEqual([
      [unlistedNote.postId, 'unlisted'],
      [publicNote.postId, 'public'],
    ]);
    expect(await statusIds(loggedIn)).toHaveLength(7);
  });

  it('未認証では public のリモートの投稿のブーストを返す', async () => {
    const t = await seedAccounts();
    const publicNote = t.seed.addRemotePost(t.alice, 5_000, { visibility: 'public' });
    const publicBoost = t.seed.addRepost(t.me.actorId, publicNote.postId, 6_000);
    const privateNote = t.seed.addRemotePost(t.alice, 5_100, { visibility: 'private' });
    t.seed.addRepost(t.me.actorId, privateNote.postId, 6_100);

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`);

    expect(await statusIds(response)).toEqual([publicBoost.repostId, ...t.newestFirst.slice(1)]);
  });

  it('Link は絞り込む前の行から作る', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?limit=1`);

    expect(await response.json()).toEqual([]);
    expect(linkOf(response, 'next')?.searchParams.get('max_id')).toBe(t.boost.repostId);
    expect(linkOf(response, 'prev')?.searchParams.get('min_id')).toBe(t.boost.repostId);
  });

  it('exclude_reblogs=true はブーストを除く', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?exclude_reblogs=true`, {
      headers: t.me.bearer,
    });

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(1));
  });

  it('exclude_replies=true は返信を除き、ブーストは残す', async () => {
    const t = await seedAccounts();

    const [mine, alices] = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?exclude_replies=true`, { headers: t.me.bearer }),
      t.request(`/api/v1/accounts/${t.alice.actorId}/statuses?exclude_replies=true`, { headers: t.me.bearer }),
    ]);

    expect(await statusIds(mine)).toEqual(t.newestFirst.filter((id) => id !== t.reply.postId));
    expect(await statusIds(alices)).toEqual([t.note.postId, t.aliceSecond.postId, t.aliceFirst.postId]);
  });

  it('only_media=true は画像のある投稿だけを返す', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?only_media=true`, {
      headers: t.me.bearer,
    });

    const statuses = parseStatuses(await response.json());
    expect(statuses.map((status) => status.id)).toEqual([t.media.postId]);
    expect(statuses[0]?.media_attachments).toHaveLength(1);
  });

  it('pinned=true と tagged の指定は空配列を返し、Link を付けない', async () => {
    const t = await seedAccounts();

    const responses = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?pinned=true`, { headers: t.me.bearer }),
      t.request(`/api/v1/accounts/${t.me.actorId}/statuses?tagged=iori`, { headers: t.me.bearer }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect(response.headers.get('Link')).toBeNull();
    }
  });

  it('limit と max_id と Link ヘッダーでページを送る', async () => {
    const t = await seedAccounts();

    const first = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?limit=2`, { headers: t.me.bearer });
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`, { headers: t.me.bearer });
    const secondNext = linkOf(second, 'next');
    const third = await t.request(`${secondNext?.pathname}${secondNext?.search}`, { headers: t.me.bearer });

    expect(await statusIds(first)).toEqual(t.newestFirst.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.reply.postId);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.boost.repostId);
    expect(await statusIds(second)).toEqual(t.newestFirst.slice(2, 4));
    expect(await statusIds(third)).toEqual(t.newestFirst.slice(4));
  });

  it('同じ時刻の投稿を (createdAt, id) の順で区切る', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?max_id=${t.tieB.postId}`, {
      headers: t.me.bearer,
    });

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(3));
  });

  it('ブーストの id も max_id に使える', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?max_id=${t.boost.repostId}`, {
      headers: t.me.bearer,
    });

    expect(await statusIds(response)).toEqual(t.newestFirst.slice(1));
  });

  it('min_id は直後の投稿を取り、新しい順に返す', async () => {
    const t = await seedAccounts();

    const response = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses?min_id=${t.first.postId}&limit=2`, {
      headers: t.me.bearer,
    });

    expect(await statusIds(response)).toEqual([t.tieA.postId, t.media.postId]);
    expect(linkOf(response, 'prev')?.searchParams.get('min_id')).toBe(t.tieA.postId);
    expect(linkOf(response, 'next')?.searchParams.get('max_id')).toBe(t.media.postId);
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
});
