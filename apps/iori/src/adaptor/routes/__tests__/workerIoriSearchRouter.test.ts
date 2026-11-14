import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { AccountSchema, StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const parseStatuses = (body: unknown) => (body as unknown[]).map((item) => StatusSchema.parse(item));

const searchUrl = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`;

const seedTimeline = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
  const t = setupReadApi(options);
  const me = await t.signIn('read:search');
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob');
  const carol = t.seed.addRemoteActor('carol');
  const dave = t.seed.addRemoteActor('dave');
  t.seed.addFollow(me.actorId, alice.actorId);
  t.seed.addFollow(me.actorId, carol.actorId);
  t.seed.addFollow(me.actorId, dave.actorId);
  t.seed.addMute(me.userId, carol.actorId);
  const mine = t.seed.addLocalPost(me, 1_000, { content: '<p>京都で旅行した</p>' });
  const fromAlice = t.seed.addRemotePost(alice, 3_000, { content: '<p>旅行の計画</p>' });
  const fromDave = t.seed.addRemotePost(dave, 2_000, { content: '<p>京都の寺</p>' });
  const fromBob = t.seed.addRemotePost(bob, 4_000, { content: '<p>京都旅行</p>' });
  const fromCarol = t.seed.addRemotePost(carol, 5_000, { content: '<p>京都の旅行</p>' });
  return { ...t, me, alice, bob, mine, fromAlice, fromDave, fromBob, fromCarol };
};

describe('GET /api/iori/v1/search/statuses', () => {
  it('Bearer なし・Cookie なしは 401 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }));

    expect(response.status).toBe(401);
  });

  it('read:search を満たさない scope のトークンは 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write');

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: me.bearer,
    });

    expect(response.status).toBe(403);
  });

  it('q がないと 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request('/api/iori/v1/search/statuses', { headers: t.me.bearer });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: q' });
  });

  it('limit が 41 だと 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都', limit: '41' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: limit' });
  });

  it('actor のない利用者は 422 にする', async () => {
    const t = await seedTimeline();
    const withoutActor = await t.bearerFor('read:search');

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: withoutActor,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Actor not found' });
  });

  it('本人とフォロー中の投稿だけを点数順の Status で返す', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都 旅行' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { statuses: unknown[]; terms: unknown; expansion: unknown };
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([
      t.mine.postId,
      t.fromAlice.postId,
      t.fromDave.postId,
    ]);
    expect(body.terms).toEqual({ original: ['京都', '旅行'], expanded: [] });
  });

  it('フォローしていない相手とミュート中の相手の投稿を返さない', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都 旅行' }), {
      headers: t.me.bearer,
    });

    const ids = parseStatuses(((await response.json()) as { statuses: unknown[] }).statuses).map((status) => status.id);
    expect(ids).not.toContain(t.fromBob.postId);
    expect(ids).not.toContain(t.fromCarol.postId);
  });

  it('フォロー中の相手の宛先外の direct を返さず、宛先の direct は返す', async () => {
    const t = await seedTimeline();
    const toOther = t.seed.addRemotePost(t.alice, 6_000, {
      content: '<p>京都 other</p>',
      visibility: 'direct',
      recipientActorUris: ['https://iori.test/users/other'],
    });
    const toMe = t.seed.addRemotePost(t.alice, 7_000, {
      content: '<p>京都 me</p>',
      visibility: 'direct',
      recipientActorUris: ['https://iori.test/users/kosui'],
    });

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    const ids = parseStatuses(((await response.json()) as { statuses: unknown[] }).statuses).map((status) => status.id);
    expect(ids).not.toContain(toOther.postId);
    expect(ids).toContain(toMe.postId);
  });

  it('textGenerator がなければ expansion を skipped にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[]; expansion: string };
    expect(body.expansion).toBe('skipped');
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([t.fromDave.postId, t.mine.postId]);
  });

  it('検索の途中で想定外のエラーが起きると 500 にする', async () => {
    const t = await seedTimeline({
      searchTimeline: {
        actorsResolverByFollowerId: { resolve: () => RA.err({ type: 'DatabaseError' }) as never },
      },
    });

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });

  it('Server-Timing ヘッダーに search、assemble、total を付ける', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    const header = response.headers.get('Server-Timing');
    expect(header).toContain('search;dur=');
    expect(header).toContain('assemble;dur=');
    expect(header).toContain('total;dur=');
    expect(header).toMatch(/^search;dur=[\d.]+, assemble;dur=[\d.]+, total;dur=[\d.]+$/);
  });
});

describe('GET /api/v2/search', () => {
  it('statuses に検索結果を入れ、accounts と hashtags は空にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都 旅行' }), { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { accounts: unknown[]; statuses: unknown[]; hashtags: unknown[] };
    expect(body.accounts).toEqual([]);
    expect(body.hashtags).toEqual([]);
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([
      t.mine.postId,
      t.fromAlice.postId,
      t.fromDave.postId,
    ]);
    expect(Object.keys(body).sort()).toEqual(['accounts', 'hashtags', 'statuses']);
  });

  it('Bearer なしは 401、scope が足りなければ 403 にする', async () => {
    const t = await seedTimeline();
    const writer = await t.bearerFor('write');

    const anonymous = await t.request(searchUrl('/api/v2/search', { q: '京都' }));
    const forbidden = await t.request(searchUrl('/api/v2/search', { q: '京都' }), { headers: writer });

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('type が accounts と hashtags のときは検索せずに空を返す', async () => {
    const t = await seedTimeline();

    const accounts = await t.request(searchUrl('/api/v2/search', { q: '京都', type: 'accounts' }), {
      headers: t.me.bearer,
    });
    const hashtags = await t.request(searchUrl('/api/v2/search', { q: '京都', type: 'hashtags' }), {
      headers: t.me.bearer,
    });

    expect(await accounts.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(await hashtags.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('type が未知の値なら 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都', type: 'foo' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: type' });
  });

  it('offset が 1 以上なら検索せずに空の statuses を返す', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都', offset: '20' }), {
      headers: t.me.bearer,
    });

    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('offset が整数でなければ 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都', offset: 'abc' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: offset' });
  });

  it('q がないか空なら 400 にする', async () => {
    const t = await seedTimeline();

    const missing = await t.request('/api/v2/search', { headers: t.me.bearer });
    const empty = await t.request(searchUrl('/api/v2/search', { q: '' }), { headers: t.me.bearer });
    const blank = await t.request(searchUrl('/api/v2/search', { q: '   ', type: 'statuses' }), {
      headers: t.me.bearer,
    });

    expect(missing.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'Validation failed: q' });
  });

  it('type が accounts と hashtags のときは、q がなくても 200 で空を返す', async () => {
    const t = await seedTimeline();

    const accounts = await t.request(searchUrl('/api/v2/search', { type: 'accounts' }), { headers: t.me.bearer });
    const hashtags = await t.request(searchUrl('/api/v2/search', { type: 'hashtags' }), { headers: t.me.bearer });

    expect(accounts.status).toBe(200);
    expect(hashtags.status).toBe(200);
    expect(await accounts.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('account_id でフォロー中の 1 人の投稿に絞る', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都 旅行', account_id: t.alice.actorId }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[] };
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([t.fromAlice.postId]);
  });

  it('フォローしていない相手の account_id では空の statuses を返す', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都 旅行', account_id: t.bob.actorId }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('解釈できない account_id では空の statuses を返す', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都 旅行', account_id: 'not-an-id' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('max_id と min_id が指定されたら検索せずに空の statuses を返す', async () => {
    const t = await seedTimeline();

    const maxId = await t.request(searchUrl('/api/v2/search', { q: '京都', max_id: t.mine.postId }), {
      headers: t.me.bearer,
    });
    const minId = await t.request(searchUrl('/api/v2/search', { q: '京都', min_id: t.mine.postId }), {
      headers: t.me.bearer,
    });

    expect(await maxId.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(await minId.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('limit が 41 以上なら 40 件に丸め、0 以下なら 1 件に丸める', async () => {
    const t = await seedTimeline();
    for (let i = 0; i < 45; i++) {
      t.seed.addRemotePost(t.alice, 10_000 + i, { content: `<p>大量の旅行 ${i}</p>` });
    }

    const over = await t.request(searchUrl('/api/v2/search', { q: '旅行', limit: '41' }), { headers: t.me.bearer });
    const zero = await t.request(searchUrl('/api/v2/search', { q: '旅行', limit: '0' }), { headers: t.me.bearer });

    expect(over.status).toBe(200);
    expect(parseStatuses(((await over.json()) as { statuses: unknown[] }).statuses)).toHaveLength(40);
    expect(zero.status).toBe(200);
    expect(parseStatuses(((await zero.json()) as { statuses: unknown[] }).statuses)).toHaveLength(1);
  });
});

describe('GET /api/v2/search の resolve=true', () => {
  const remotePerson = (username: string) =>
    new Person({
      id: new URL(`https://remote.example/users/${username}`),
      inbox: new URL(`https://remote.example/users/${username}/inbox`),
      preferredUsername: username,
      url: new URL(`https://remote.example/@${username}`),
    });

  const seedResolve = async () => {
    const t = await seedTimeline();
    t.remoteActorLookup.lookup.mockImplementation(() => RA.ok(remotePerson('erin')) as never);
    const actorCount = () =>
      Number((t.sqlite.prepare('SELECT count(*) AS n FROM actors').get() as { n: number | bigint }).n);
    const search = (params: Record<string, string>, headers: Record<string, string> = t.me.bearer) =>
      t.request(searchUrl('/api/v2/search', params), { headers });
    return { ...t, actorCount, search };
  };

  it('acct の形の q をリモートから解決して accounts に入れ、アクターを保存する', async () => {
    const t = await seedResolve();
    const before = t.actorCount();

    const response = await t.search({ q: '@erin@remote.example', resolve: 'true', type: 'accounts' });

    expect(response.status).toBe(200);
    const body = await response.json() as { accounts: unknown[]; statuses: unknown[]; hashtags: unknown[] };
    const accounts = body.accounts.map((item) => AccountSchema.parse(item));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ username: 'erin', acct: 'erin@remote.example' });
    expect([body.statuses, body.hashtags]).toEqual([[], []]);
    expect(t.actorCount()).toBe(before + 1);
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'erin@remote.example', identifier: 'kosui' }),
    );
  });

  it('@ を省いた形も解決し、type を省くと投稿の検索と同時に返す', async () => {
    const t = await seedResolve();

    const response = await t.search({ q: 'erin@remote.example', resolve: '1' });

    const body = await response.json() as { accounts: unknown[]; statuses: unknown[] };
    expect(body.accounts.map((item) => AccountSchema.parse(item).username)).toEqual(['erin']);
    expect(body.statuses).toEqual([]);
  });

  it('保存済みのアクターは重複して作らず、その ID の Account を返す', async () => {
    const t = await seedResolve();
    t.remoteActorLookup.lookup.mockImplementation(() => RA.ok(remotePerson('carol')) as never);
    const known = t.sqlite.prepare('SELECT actorId FROM actors WHERE uri = ?').get(
      'https://remote.example/users/carol',
    ) as { actorId: string };
    const before = t.actorCount();

    const response = await t.search({ q: '@carol@remote.example', resolve: 'true', type: 'accounts' });

    const body = await response.json() as { accounts: unknown[] };
    expect(body.accounts.map((item) => AccountSchema.parse(item).id)).toEqual([known.actorId]);
    expect(t.actorCount()).toBe(before);
  });

  it('acct: 付きの q も解決し、先頭の acct: を取り除いたハンドルで検索する', async () => {
    const t = await seedResolve();

    const response = await t.search({ q: 'acct:erin@remote.example', resolve: 'true', type: 'accounts' });

    const body = await response.json() as { accounts: unknown[] };
    expect(body.accounts.map((item) => AccountSchema.parse(item).username)).toEqual(['erin']);
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledWith(expect.objectContaining({ handle: 'erin@remote.example' }));
  });

  it('https の URL の q を、その URL のまま解決して accounts に入れる', async () => {
    const t = await seedResolve();

    const response = await t.search({ q: 'https://remote.example/users/erin', resolve: 'true', type: 'accounts' });

    const body = await response.json() as { accounts: unknown[] };
    expect(body.accounts.map((item) => AccountSchema.parse(item).username)).toEqual(['erin']);
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'https://remote.example/users/erin' }),
    );
  });

  it('http の URL は解決せず、accounts を空にして 200 を返す', async () => {
    const t = await seedResolve();

    const response = await t.search({ q: 'http://remote.example/users/erin', resolve: 'true', type: 'accounts' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
  });

  it('ユーザー情報付きの URL は解決せず、accounts を空にして 200 を返す', async () => {
    const t = await seedResolve();

    const response = await t.search({
      q: 'https://user:pw@remote.example/users/erin',
      resolve: 'true',
      type: 'accounts',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
  });

  it('外部の取得が例外を投げても、検索全体を 500 にせず accounts を空にして投稿の検索を返す', async () => {
    const t = await seedResolve();
    t.remoteActorLookup.lookup.mockImplementation(() => {
      throw new Error('network down');
    });

    const response = await t.search({ q: '@erin@remote.example', resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
  });

  it('アカウントの解決が 10 秒で終わらないときは、accounts を空にして検索を返す', async () => {
    const t = await seedResolve();
    t.remoteActorLookup.lookup.mockImplementation(() => new Promise(() => undefined) as never);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = t.search({ q: '@erin@remote.example', resolve: 'true' });
      await vi.waitFor(() => expect(t.remoteActorLookup.lookup).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolve がないか true でないときは解決しない', async () => {
    const t = await seedResolve();

    const responses = await Promise.all([
      t.search({ q: '@carol@remote.example', type: 'accounts' }),
      t.search({ q: '@carol@remote.example', type: 'accounts', resolve: 'false' }),
    ]);

    for (const response of responses) {
      expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    }
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
  });

  it('acct の形でも https の URL でもない q、自サーバーの acct と URL、type=statuses、ページ送りでは解決しない', async () => {
    const t = await seedResolve();

    await Promise.all([
      t.search({ q: 'carol', resolve: 'true', type: 'accounts' }),
      t.search({ q: '@carol', resolve: 'true', type: 'accounts' }),
      t.search({ q: 'carol@', resolve: 'true', type: 'accounts' }),
      t.search({ q: '京都 旅行', resolve: 'true', type: 'accounts' }),
      t.search({ q: 'http://remote.example/users/carol', resolve: 'true', type: 'accounts' }),
      t.search({ q: 'ftp://remote.example/users/carol', resolve: 'true', type: 'accounts' }),
      t.search({ q: 'https://iori.test/users/kosui', resolve: 'true', type: 'accounts' }),
      t.search({ q: 'acct:kosui@iori.test', resolve: 'true', type: 'accounts' }),
      t.search({ q: '@kosui@iori.test', resolve: 'true', type: 'accounts' }),
      t.search({ q: '@carol@remote.example', resolve: 'true', type: 'statuses' }),
      t.search({ q: '@carol@remote.example', resolve: 'true', type: 'accounts', offset: '20' }),
    ]);

    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
  });

  it('解決できなかったときは accounts を空にして 200 を返し、アクターを作らない', async () => {
    const t = await seedResolve();
    t.remoteActorLookup.lookup.mockImplementation(() =>
      RA.err({ type: 'RemoteActorLookupError', message: 'Failed', detail: { handle: 'x', reason: 'x' } }) as never
    );
    const before = t.actorCount();

    const response = await t.search({ q: '@ghost@remote.example', resolve: 'true', type: 'accounts' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(t.actorCount()).toBe(before);
  });

  it('ログインしていないと 401 にして解決しない', async () => {
    const t = await seedResolve();

    const response = await t.request(
      searchUrl('/api/v2/search', { q: '@carol@remote.example', resolve: 'true', type: 'accounts' }),
    );

    expect(response.status).toBe(401);
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
  });
});

describe('GET /api/v2/search の投稿の URL の解決', () => {
  const HTML_URL = 'https://remote.example/@erin/123';
  const NOTE_URI = 'https://remote.example/notes/erin-123';
  const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');

  const erinNote = (id = NOTE_URI) =>
    new Note({
      id: new URL(id),
      content: '<p>erin の投稿</p>',
      to: publicUri,
      attribution: new Person({
        id: new URL('https://remote.example/users/erin'),
        inbox: new URL('https://remote.example/users/erin/inbox'),
        preferredUsername: 'erin',
        url: new URL('https://remote.example/@erin'),
      }),
    });

  const seedUrl = async (options: Parameters<typeof seedTimeline>[0] = {}) => {
    const t = await seedTimeline(options);
    t.federation.lookupObject.mockImplementation(async (uri?: string) =>
      uri === HTML_URL || uri === NOTE_URI ? erinNote() : null
    );
    const search = (params: Record<string, string>, headers: Record<string, string> = t.me.bearer) =>
      t.request(searchUrl('/api/v2/search', params), { headers });
    const statusesOf = async (response: Response) =>
      parseStatuses(((await response.json()) as { statuses: unknown[] }).statuses);
    const remotePostCount = () =>
      Number((t.sqlite.prepare('SELECT count(*) AS n FROM remote_posts').get() as { n: number | bigint }).n);
    return { ...t, search, statusesOf, remotePostCount };
  };

  it('resolve=true で URL の投稿を相手のサーバーから取り込み、statuses の先頭に出す', async () => {
    const t = await seedUrl();
    const before = t.remotePostCount();

    const response = await t.search({ q: HTML_URL, resolve: 'true' });

    expect(response.status).toBe(200);
    const statuses = await t.statusesOf(response);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ account: { username: 'erin' } });
    expect(t.remotePostCount()).toBe(before + 1);
    expect(t.federation.lookupObject).toHaveBeenCalledWith(HTML_URL, expect.anything());
    expect(t.federation.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
  });

  it('type=statuses でも解決し、取り込んだ投稿は詳細で引ける ID の Status にする', async () => {
    const t = await seedUrl();

    const statuses = await t.statusesOf(await t.search({ q: NOTE_URI, resolve: 'true', type: 'statuses' }));

    const saved = t.sqlite.prepare('SELECT postId FROM remote_posts WHERE uri = ?').get(NOTE_URI) as {
      postId: string;
    };
    expect(statuses.map((status) => status.id)).toEqual([saved.postId]);
  });

  it('同じ URL をもう一度検索しても、保存した投稿を重複させず取得もしない', async () => {
    const t = await seedUrl();
    await t.search({ q: NOTE_URI, resolve: 'true' });
    const before = t.remotePostCount();
    t.federation.lookupObject.mockClear();

    const statuses = await t.statusesOf(await t.search({ q: NOTE_URI, resolve: 'true' }));

    expect(statuses).toHaveLength(1);
    expect(t.remotePostCount()).toBe(before);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('解決した投稿だけを返し、通常の検索に当たる投稿は混ぜない', async () => {
    const t = await seedUrl();
    const q = 'https://remote.example/@alice/travel';
    t.seed.addRemotePost(t.alice, 1_000, { content: `<p>${q}</p>` });
    t.federation.lookupObject.mockImplementation(async (uri?: string) => uri === q ? erinNote() : null);

    const resolved = await t.statusesOf(await t.search({ q, resolve: 'true' }));

    const saved = t.sqlite.prepare('SELECT postId FROM remote_posts WHERE uri = ?').get(NOTE_URI) as {
      postId: string;
    };
    expect(resolved.map((status) => status.id)).toEqual([saved.postId]);
  });

  it('解決した投稿が通常の検索にも当たるときは、その投稿を 1 件だけ返す', async () => {
    const t = await seedUrl();
    const q = 'https://remote.example/@alice/travel';
    const same = t.seed.addRemotePost(t.alice, 1_000, { content: `<p>${q}</p>` });
    t.federation.lookupObject.mockImplementation(async (uri?: string) => uri === q ? erinNote(same.uri) : null);
    const normal = await t.statusesOf(await t.search({ q }));
    expect(normal.map((status) => status.id)).toContain(same.postId);

    const resolved = await t.statusesOf(await t.search({ q, resolve: 'true' }));

    expect(resolved.map((status) => status.id)).toEqual([same.postId]);
  });

  it('resolve がないか true でないときは、取り込まず通常の検索を返す', async () => {
    const t = await seedUrl();
    const q = 'https://remote.example/@alice/travel';
    const mention = t.seed.addRemotePost(t.alice, 1_000, { content: `<p>${q}</p>` });
    const before = t.remotePostCount();

    const responses = await Promise.all([
      t.search({ q }),
      t.search({ q, resolve: 'false' }),
    ]);

    for (const response of responses) {
      expect((await t.statusesOf(response)).map((status) => status.id)).toEqual([mention.postId]);
    }
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostCount()).toBe(before);
  });

  it('type=accounts と type=hashtags では投稿を解決しない', async () => {
    const t = await seedUrl();
    const before = t.remotePostCount();

    await Promise.all([
      t.search({ q: HTML_URL, resolve: 'true', type: 'accounts' }),
      t.search({ q: HTML_URL, resolve: 'true', type: 'hashtags' }),
    ]);

    expect(t.federation.lookupObject).not.toHaveBeenCalledWith(HTML_URL, expect.anything());
    expect(t.remotePostCount()).toBe(before);
  });

  it('ページ送りのときは解決しない', async () => {
    const t = await seedUrl();

    await Promise.all([
      t.search({ q: HTML_URL, resolve: 'true', offset: '20' }),
      t.search({ q: HTML_URL, resolve: 'true', max_id: 'x' }),
    ]);

    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('URL でない q、http の URL、自サーバーの URL では解決しない', async () => {
    const t = await seedUrl();

    await Promise.all([
      t.search({ q: '京都 旅行', resolve: 'true' }),
      t.search({ q: 'http://remote.example/@erin/123', resolve: 'true' }),
      t.search({ q: 'https://iori.test/users/kosui/posts/none', resolve: 'true' }),
      t.search({ q: 'https://user:pw@remote.example/@erin/123', resolve: 'true' }),
    ]);

    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('閲覧者に見えない保存済みの投稿は出さない', async () => {
    const t = await seedUrl();
    const hidden = t.seed.addRemotePost(t.bob, 2_000, { visibility: 'private', timeline: false });

    const response = await t.search({ q: hidden.uri, resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await t.statusesOf(response)).toEqual([]);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('ブロックした相手の投稿は取り込まず、statuses を空にして 200 を返す', async () => {
    const t = await seedUrl();
    const erin = t.seed.addRemoteActor('erin');
    t.seed.addBlock(t.me.userId, erin.actorId);
    t.seed.addRemotePost(t.alice, 1_000, { content: `<p>${HTML_URL}</p>` });
    const before = t.remotePostCount();

    const response = await t.search({ q: HTML_URL, resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await t.statusesOf(response)).toEqual([]);
    expect(t.remotePostCount()).toBe(before);
  });

  it('取得できなかったときは、取り込まず statuses を空にして 200 を返す', async () => {
    const t = await seedUrl();
    t.federation.lookupObject.mockImplementation(async () => null);
    t.seed.addRemotePost(t.alice, 1_000, { content: `<p>${HTML_URL}</p>` });
    const before = t.remotePostCount();

    const response = await t.search({ q: HTML_URL, resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [], statuses: [], hashtags: [] });
    expect(t.remotePostCount()).toBe(before);
  });

  it('取得が例外を投げても、検索全体を 500 にしない', async () => {
    const t = await seedUrl();
    t.federation.lookupObject.mockImplementation(async () => {
      throw new Error('network down');
    });

    const response = await t.search({ q: HTML_URL, resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await t.statusesOf(response)).toEqual([]);
  });

  it('アカウントの解決が時間切れでも、解決した投稿を返す', async () => {
    const t = await seedUrl();
    t.remoteActorLookup.lookup.mockImplementation(() => new Promise(() => undefined) as never);
    const before = t.remotePostCount();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = t.search({ q: HTML_URL, resolve: 'true' });
      await vi.waitFor(() => expect(t.remotePostCount()).toBe(before + 1));
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;

      expect(response.status).toBe(200);
      const body = (await response.json()) as { accounts: unknown[]; statuses: unknown[] };
      expect(body.accounts).toEqual([]);
      expect(parseStatuses(body.statuses)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ブロックした相手の保存済みの投稿は、resolve=true で検索しても statuses に出ない', async () => {
    const t = await seedUrl();
    t.seed.addBlock(t.me.userId, t.bob.actorId);
    const stored = t.seed.addRemotePost(t.bob, 2_000, { content: '<p>bob の投稿</p>', timeline: false });

    const response = await t.search({ q: stored.uri, resolve: 'true' });

    expect(response.status).toBe(200);
    expect(await t.statusesOf(response)).toEqual([]);
  });

  it('account_id を指定したときは解決しない', async () => {
    const t = await seedUrl();

    await t.search({ q: HTML_URL, resolve: 'true', account_id: t.alice.actorId });

    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });
});
