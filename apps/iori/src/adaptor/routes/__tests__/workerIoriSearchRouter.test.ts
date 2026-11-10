import { Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { TextGenerator } from '../../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../../testing/aiStubs.ts';
import { AccountSchema, StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const parseStatuses = (body: unknown) => (body as unknown[]).map((item) => StatusSchema.parse(item));

const searchUrl = (path: string, params: Record<string, string>) => `${path}?${new URLSearchParams(params).toString()}`;

const neverResolvingGenerator: TextGenerator = {
  summarize: () => new Promise(() => {}),
  generate: () => new Promise(() => {}),
};

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

  it('Cookie でも検索できる', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: { Cookie: `sessionId=${t.me.sessionId}` },
    });

    expect(response.status).toBe(200);
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

  it('q が空白だけだと 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '   ' }), {
      headers: t.me.bearer,
    });

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

  it('limit で件数を絞る', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都 旅行', limit: '1' }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[] };
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([t.mine.postId]);
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

  it('textGenerator が展開語を返すと、展開語で一致した投稿も返す', async () => {
    const stub = createStubTextGenerator(() => '["旅行"]');
    const t = await seedTimeline({ textGenerator: stub.generator });

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[]; expansion: string; terms: unknown };
    expect(body.expansion).toBe('expanded');
    expect(body.terms).toEqual({ original: ['京都'], expanded: ['旅行'] });
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([
      t.mine.postId,
      t.fromDave.postId,
      t.fromAlice.postId,
    ]);
  });

  it('長い文の問い合わせは dropped_original に入れる', async () => {
    const t = await seedTimeline();
    const sentence = '先週の旅行で食べたおいしいものについて詳しく教えてください';

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: `京都 ${sentence}` }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[]; dropped_original: string[]; terms: unknown };
    expect(body.dropped_original).toEqual([sentence]);
    expect(body.terms).toEqual({ original: ['京都'], expanded: [] });
    expect(parseStatuses(body.statuses)).toHaveLength(2);
  });

  it('展開が期限を過ぎても 200 で、expansion を failed にして元の語で検索する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await seedTimeline({
      textGenerator: neverResolvingGenerator,
      searchTimeline: { expansionTimeoutMs: 10 },
    });

    const response = await t.request(searchUrl('/api/iori/v1/search/statuses', { q: '京都' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { statuses: unknown[]; expansion: string; terms: unknown };
    expect(body.expansion).toBe('failed');
    expect(body.terms).toEqual({ original: ['京都'], expanded: [] });
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([t.fromDave.postId, t.mine.postId]);
    warn.mockRestore();
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

  it('type が statuses のときは検索する', async () => {
    const t = await seedTimeline();

    const response = await t.request(searchUrl('/api/v2/search', { q: '京都', type: 'statuses' }), {
      headers: t.me.bearer,
    });

    const body = (await response.json()) as { statuses: unknown[] };
    expect(parseStatuses(body.statuses).map((status) => status.id)).toEqual([t.fromDave.postId, t.mine.postId]);
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

  it('limit が数値でなければ既定の 20 件にする', async () => {
    const t = await seedTimeline();
    for (let i = 0; i < 25; i++) {
      t.seed.addRemotePost(t.alice, 10_000 + i, { content: `<p>大量の旅行 ${i}</p>` });
    }

    const response = await t.request(searchUrl('/api/v2/search', { q: '旅行', limit: 'abc' }), {
      headers: t.me.bearer,
    });

    expect(response.status).toBe(200);
    expect(parseStatuses(((await response.json()) as { statuses: unknown[] }).statuses)).toHaveLength(20);
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

  it('投稿の検索の結果は resolve の有無で変わらない', async () => {
    const t = await seedResolve();

    const [without, withResolve] = await Promise.all([
      t.search({ q: '京都 旅行' }),
      t.search({ q: '京都 旅行', resolve: 'true' }),
    ]);

    const idsOf = async (response: Response) =>
      ((await response.json()) as { statuses: Array<{ id: string }> }).statuses.map((status) => status.id);
    expect(await idsOf(withResolve)).toEqual(await idsOf(without));
  });
});
