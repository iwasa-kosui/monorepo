import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import type { TopicRelevanceJudge } from '../../../ports/topicRelevanceJudge.ts';
import { createStubEmbedder, createStubTextGenerator } from '../../../testing/aiStubs.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const seedDigest = (
  t: ReturnType<typeof setupReadApi>,
  owner: { userId: string },
  digestDate: string,
  options: { topicKey?: string } = {},
) => {
  const digestId = crypto.randomUUID();
  t.sqlite.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,postId,createdAt,topicKey) VALUES (?,?,?,?,?,?)',
  ).run(
    digestId,
    owner.userId,
    digestDate,
    crypto.randomUUID(),
    Date.UTC(2026, 10, 4, 21, 30),
    options.topicKey ?? 'summary',
  );
  const insertItem = t.sqlite.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(crypto.randomUUID(), digestId, 'entry-1', 'https://example.com/a', 'A', 1, 0.5, '要約 A', null);
  insertItem.run(crypto.randomUUID(), digestId, 'entry-2', 'https://example.com/b', 'B', 2, null, null, null);
  return { digestId };
};

const putSubscription = (headers: Record<string, string>, body: unknown, contentType = 'application/json') => ({
  method: 'PUT',
  headers: { 'Content-Type': contentType, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('iori のダイジェスト API', () => {
  const readPaths = [
    '/api/iori/v1/trends/links',
    '/api/iori/v1/trends/hatena',
    '/api/iori/v1/digest/subscription',
    '/api/iori/v1/digest-topics',
    '/api/iori/v1/digest-topics/preview',
  ];

  it.each(readPaths)('GET %s は認証なしだと 401 にする', async (path) => {
    const t = setupReadApi();

    const response = await t.request(path);

    expect(response.status).toBe(401);
  });

  it('PUT /api/iori/v1/digest/subscription は認証なしだと 401 にする', async () => {
    const t = setupReadApi();

    const response = await t.request('/api/iori/v1/digest/subscription', putSubscription({}, { enabled: false }));

    expect(response.status).toBe(401);
  });

  it.each(readPaths)('GET %s は read:statuses を満たさない scope のトークンを 403 にする', async (path) => {
    const t = setupReadApi();
    const me = await t.signIn('write:statuses');

    const response = await t.request(path, { headers: me.bearer });

    expect(response.status).toBe(403);
  });

  it('PUT /api/iori/v1/digest/subscription は write:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:statuses');

    const response = await t.request(
      '/api/iori/v1/digest/subscription',
      putSubscription(me.bearer, { enabled: false }),
    );

    expect(response.status).toBe(403);
  });

  describe('GET /api/iori/v1/trends/links', () => {
    it('直近 24 時間のタイムラインのリンクを件数付きで返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const own = t.seed.addLocalPost(me, Date.now());
      const insertLink = t.sqlite.prepare(
        'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      );
      insertLink.run(
        'link-recent',
        own.postId,
        'https://example.com/recent',
        'Recent',
        null,
        null,
        null,
        null,
        Date.now(),
      );
      insertLink.run(
        'link-old',
        own.postId,
        'https://example.com/old',
        'Old',
        null,
        null,
        null,
        null,
        Date.now() - 25 * 60 * 60 * 1000,
      );

      const response = await t.request('/api/iori/v1/trends/links', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        links: [{ url: 'https://example.com/recent', title: 'Recent', count: 1 }],
      });
    });
  });

  describe('GET /api/iori/v1/trends/hatena', () => {
    it('直近 24 時間に取得したはてなの人気を件数の多い順に返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      t.sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
        .run('source-1', 'hatena_hotentry', 'https://b.hatena.ne.jp/hotentry/it.rss', 'hotentry', 1, 1_000);
      const insertEntry = t.sqlite.prepare(
        'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,hatenaBookmarkCount,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?)',
      );
      insertEntry.run('e1', 'source-1', 'g1', 'https://example.com/low', 'Low', '', null, 10, Date.now());
      insertEntry.run('e2', 'source-1', 'g2', 'https://example.com/high', 'High', '', null, 300, Date.now());
      insertEntry.run(
        'e3',
        'source-1',
        'g3',
        'https://example.com/old',
        'Old',
        '',
        null,
        999,
        Date.now() - 25 * 60 * 60 * 1000,
      );

      const response = await t.request('/api/iori/v1/trends/hatena', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        entries: [
          { url: 'https://example.com/high', title: 'High', count: 300 },
          { url: 'https://example.com/low', title: 'Low', count: 10 },
        ],
      });
    });
  });

  describe('/api/iori/v1/digest/subscription', () => {
    it('GET は行がなければ enabled: true を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/digest/subscription', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ subscription: { enabled: true } });
    });

    it('PUT は保存して、GET に反映する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses write:accounts');

      const saved = await t.request('/api/iori/v1/digest/subscription', putSubscription(me.bearer, { enabled: false }));
      const read = await t.request('/api/iori/v1/digest/subscription', { headers: me.bearer });

      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({ subscription: { enabled: false } });
      expect(await read.json()).toEqual({ subscription: { enabled: false } });
    });

    it('PUT はフォームの値も受け付ける', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses write:accounts');

      const saved = await t.request(
        '/api/iori/v1/digest/subscription',
        putSubscription(me.bearer, 'enabled=false', 'application/x-www-form-urlencoded'),
      );

      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({ subscription: { enabled: false } });
    });

    it.each([{}, { enabled: 'yes' }])('PUT は %j を 400 にする', async (body) => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');

      const response = await t.request('/api/iori/v1/digest/subscription', putSubscription(me.bearer, body));

      expect(response.status).toBe(400);
      expect(t.sqlite.prepare('SELECT * FROM digest_subscriptions').all()).toEqual([]);
    });

    it('PUT は Cookie のとき Origin がなければ 403 にし、同じ Origin があれば保存する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const cookie = { Cookie: `sessionId=${me.sessionId}` };

      const withoutOrigin = await t.request(
        '/api/iori/v1/digest/subscription',
        putSubscription(cookie, { enabled: false }),
      );
      const withOrigin = await t.request(
        '/api/iori/v1/digest/subscription',
        putSubscription({ ...cookie, Origin: ORIGIN }, { enabled: false }),
      );

      expect(withoutOrigin.status).toBe(403);
      expect(withOrigin.status).toBe(200);
      expect(await withOrigin.json()).toEqual({ subscription: { enabled: false } });
    });

    it('他人の設定は読み書きしない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses write:accounts');
      const other = t.seed.addLocalActor('other');
      t.sqlite.prepare('INSERT INTO digest_subscriptions(userId,enabled,createdAt,updatedAt) VALUES (?,?,?,?)')
        .run(other.userId, 0, 1_000, 1_000);

      const read = await t.request('/api/iori/v1/digest/subscription', { headers: me.bearer });
      await t.request('/api/iori/v1/digest/subscription', putSubscription(me.bearer, { enabled: true }));

      expect(await read.json()).toEqual({ subscription: { enabled: true } });
      expect(t.sqlite.prepare('SELECT enabled FROM digest_subscriptions WHERE userId = ?').get(other.userId)).toEqual({
        enabled: 0,
      });
    });
  });

  describe('/api/iori/v1/digest-topics/preview', () => {
    const PREVIEW = '/api/iori/v1/digest-topics/preview';
    const HOUR_MS = 60 * 60 * 1000;
    const vec = (...head: number[]) =>
      float32ToBytes(Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => head[i] ?? 0));
    const today = () => Instant.toJstDate(Instant.now());
    const addTopic = (
      t: ReturnType<typeof setupReadApi>,
      userId: string,
      topicKey: string,
      sortOrder: number,
      options: { embedding?: Uint8Array | null; enabled?: boolean } = {},
    ) =>
      t.sqlite.prepare(
        'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        userId,
        topicKey,
        `${topicKey} の名前`,
        `${topicKey} の説明`,
        options.embedding === undefined ? null : options.embedding,
        options.embedding === undefined || options.embedding === null ? null : 1,
        sortOrder,
        options.enabled === false ? 0 : 1,
        1,
        1,
      );
    const uuidOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const addEntry = (
      t: ReturnType<typeof setupReadApi>,
      n: number,
      embedding: Uint8Array | null,
      fetchedAt: number,
    ) => {
      t.sqlite.prepare(
        'INSERT OR IGNORE INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)',
      ).run(uuidOf(0), 'rss', 'https://feeds.example/rss', 'rss', 1, 1_000);
      t.sqlite.prepare(
        'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        uuidOf(n),
        uuidOf(0),
        uuidOf(n),
        `https://example.com/${uuidOf(n)}`,
        `記事 ${n}`,
        '',
        null,
        fetchedAt,
        embedding,
        embedding === null ? null : 2_000,
      );
    };
    const preview = async (t: ReturnType<typeof setupReadApi>, me: { bearer: Record<string, string> }, query = '') =>
      t.request(`${PREVIEW}${query}`, { headers: me.bearer });
    const write = /^\s*(insert|update|delete|replace|create|drop|alter)\b/i;

    it('ほかのユーザーのテーマとダイジェスト項目を返さない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const other = t.seed.addLocalActor('other');
      addTopic(t, other.userId, 'security', 0, { embedding: vec(1, 0, 0) });
      addEntry(t, 1, vec(1, 0, 0), Date.now() - HOUR_MS);
      seedDigest(t, other, today(), { topicKey: 'security' });

      const body = await (await preview(t, me)).json() as {
        topics: unknown[];
        candidates: { total: number; byTopic: unknown[] };
        digestItems: unknown[];
      };

      expect(body.topics).toEqual([]);
      expect(body.candidates.byTopic).toEqual([]);
      expect(body.candidates.total).toBe(1);
      expect(body.digestItems).toEqual([]);
    });

    describe('?withJev', () => {
      type JevBody = {
        jev?: unknown;
        candidates: { byTopic: Array<{ top: Array<{ feedEntryId: string; jevNoul?: number | null }> }> };
      };
      const seedForJev = (t: ReturnType<typeof setupReadApi>, userId: string) => {
        addTopic(t, userId, 'genai', 0, { embedding: vec(1, 0, 0) });
        addEntry(t, 1, vec(1, 0, 0), Date.now() - HOUR_MS);
        addEntry(t, 2, vec(2, 1, 0), Date.now() - HOUR_MS);
      };

      it('?withJev=true なら、上位の候補に jevNoul を足し、jev に使ったモデルを返す', async () => {
        const judge = vi.fn<TopicRelevanceJudge['judge']>(() => RA.ok({ noul: 0.7 }));
        const t = setupReadApi({ topicRelevanceJudge: { judge } });
        const me = await t.signIn('read:statuses');
        seedForJev(t, me.userId);

        const response = await preview(t, me, '?withJev=true');
        const body = await response.json() as JevBody;

        expect(response.status).toBe(200);
        expect(body.jev).toEqual({
          model: 'typesafe/jev',
          configured: true,
          perTopicLimit: 5,
          totalLimit: 60,
          overTotalLimit: false,
        });
        expect(body.candidates.byTopic[0]!.top.map((candidate) => candidate.jevNoul)).toEqual([0.7, 0.7]);
        expect(judge).toHaveBeenCalledWith({
          model: 'typesafe/jev',
          topic: { name: 'genai の名前', description: 'genai の説明' },
          article: { title: expect.stringMatching(/^記事 [12]$/), excerpt: '' },
        });
      });

      it('?withJev=yes は 400 にして、withJev を返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await preview(t, me, '?withJev=yes');

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Validation failed: withJev' });
      });
    });

    it('クエリで候補記事の期間、ダイジェスト項目の期間、上位と下位の件数を絞る', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      addTopic(t, me.userId, 'genai', 0, { embedding: vec(1, 0, 0) });
      addEntry(t, 1, vec(1, 0, 0), Date.now() - HOUR_MS / 2);
      addEntry(t, 2, vec(2, 1, 0), Date.now() - HOUR_MS / 2);
      addEntry(t, 3, vec(1, 0, 0), Date.now() - 10 * HOUR_MS);
      seedDigest(t, me, today(), { topicKey: 'genai' });
      seedDigest(t, me, Instant.toJstDate(Instant.addDuration(Instant.now(), -3 * 24 * HOUR_MS)), {
        topicKey: 'genai',
      });
      type Body = {
        candidates: { total: number; byTopic: Array<{ count: number; top: unknown[]; bottom: unknown[] }> };
        digestItems: unknown[];
      };

      const defaults = await (await preview(t, me)).json() as Body;
      const narrowed = await (await preview(t, me, '?candidateHours=1&digestDays=2&limit=1')).json() as Body;

      expect(defaults.candidates.total).toBe(3);
      expect(defaults.candidates.byTopic[0]).toMatchObject({ count: 3 });
      expect(defaults.candidates.byTopic[0]!.top).toHaveLength(3);
      expect(defaults.digestItems).toHaveLength(4);
      expect(narrowed.candidates.total).toBe(2);
      expect(narrowed.candidates.byTopic[0]).toMatchObject({ count: 2 });
      expect(narrowed.candidates.byTopic[0]!.top).toHaveLength(1);
      expect(narrowed.candidates.byTopic[0]!.bottom).toHaveLength(1);
      expect(narrowed.digestItems).toHaveLength(2);
    });

    it.each([
      ['candidateHours=0', 'candidateHours'],
      ['candidateHours=abc', 'candidateHours'],
      ['digestDays=31', 'digestDays'],
      ['limit=101', 'limit'],
    ])('?%s は 400 にして、範囲外のパラメーター名を返す', async (query, name) => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await preview(t, me, `?${query}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: `Validation failed: ${name}` });
    });

    it('D1 に書き込まず、埋め込みも要約も呼ばない', async () => {
      const embedder = createStubEmbedder(EMBEDDING_DIMENSIONS);
      const generator = createStubTextGenerator(() => '要約');
      const t = setupReadApi({ textEmbedder: embedder.embedder, textGenerator: generator.generator });
      const me = await t.signIn('read:statuses');
      addTopic(t, me.userId, 'genai', 0, { embedding: vec(1, 0, 0) });
      addEntry(t, 1, vec(1, 0, 0), Date.now() - HOUR_MS);
      seedDigest(t, me, today(), { topicKey: 'genai' });
      const changesBefore = t.sqlite.prepare('SELECT total_changes() AS n').get();
      const tablesBefore = t.sqlite.prepare('SELECT count(*) AS n FROM domain_events').get();
      t.queries.length = 0;

      const response = await preview(t, me);

      expect(response.status).toBe(200);
      expect(t.queries.length).toBeGreaterThan(0);
      expect(t.queries.filter((query) => write.test(query.sql))).toEqual([]);
      expect(t.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changesBefore);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM domain_events').get()).toEqual(tablesBefore);
      expect(embedder.calls).toEqual([]);
      expect(generator.calls).toEqual([]);
    });
  });

  describe('/api/iori/v1/digest-topics', () => {
    afterEach(() => vi.restoreAllMocks());

    const stubEmbedder = () => createStubEmbedder(EMBEDDING_DIMENSIONS).embedder;
    const seed = (
      t: ReturnType<typeof setupReadApi>,
      userId: string,
      topicKey: string,
      sortOrder: number,
      options: { embedded?: boolean; enabled?: boolean; materialWindowHours?: number } = {},
    ) =>
      t.sqlite.prepare(
        'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,materialWindowHours,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        userId,
        topicKey,
        `${topicKey} の名前`,
        `${topicKey} の説明`,
        options.embedded === false ? null : new Uint8Array(EMBEDDING_DIMENSIONS * 4),
        options.embedded === false ? null : 1,
        sortOrder,
        options.enabled === false ? 0 : 1,
        options.materialWindowHours ?? null,
        1,
        1,
      );
    const rowOf = (t: ReturnType<typeof setupReadApi>, userId: string, topicKey: string) =>
      t.sqlite.prepare(
        'SELECT name, description, enabled, materialWindowHours, embeddedAt, length(embedding) AS bytes FROM digest_topics WHERE userId = ? AND topicKey = ?',
      ).get(userId, topicKey);
    const send = (method: string, headers: Record<string, string>, body?: unknown) => ({
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookieOf = (me: { sessionId: string }, origin: string | null = ORIGIN) => ({
      Cookie: `sessionId=${me.sessionId}`,
      ...(origin === null ? {} : { Origin: origin }),
    });

    describe('GET', () => {
      it('本人のトピックだけを sortOrder の順に、embedded 付きで返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');
        const other = t.seed.addLocalActor('other');
        seed(t, me.userId, 'platform', 2, { enabled: false });
        seed(t, me.userId, 'genai', 1, { embedded: false });
        seed(t, other.userId, 'security', 0);

        const response = await t.request('/api/iori/v1/digest-topics', { headers: me.bearer });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          topics: [
            {
              topicKey: 'genai',
              name: 'genai の名前',
              description: 'genai の説明',
              enabled: true,
              materialWindowHours: null,
              sortOrder: 1,
              embedded: false,
              examples: [],
              excludes: [],
            },
            {
              topicKey: 'platform',
              name: 'platform の名前',
              description: 'platform の説明',
              enabled: false,
              materialWindowHours: null,
              sortOrder: 2,
              embedded: true,
              examples: [],
              excludes: [],
            },
          ],
        });
      });
    });

    describe('POST', () => {
      it('認証なしだと 401 にする', async () => {
        const t = setupReadApi();

        const response = await t.request(
          '/api/iori/v1/digest-topics',
          send('POST', { Origin: ORIGIN }, { name: '名前', description: '説明' }),
        );

        expect(response.status).toBe(401);
      });

      it('write:accounts を満たさない scope のトークンを 403 にする', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('read:statuses');

        const response = await t.request(
          '/api/iori/v1/digest-topics',
          send('POST', me.bearer, { name: '名前', description: '説明' }),
        );

        expect(response.status).toBe(403);
        expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_topics').get()).toEqual({ n: 0 });
      });

      it('Cookie のとき Origin がなければ 403 にし、何も作らない', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');

        const response = await t.request(
          '/api/iori/v1/digest-topics',
          send('POST', cookieOf(me, null), { name: '名前', description: '説明' }),
        );

        expect(response.status).toBe(403);
        expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_topics').get()).toEqual({ n: 0 });
      });

      it('201 と作ったトピックを返し、embedding を保存して、sortOrder を既存の最大値 + 1 にする', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('read:statuses write:accounts');
        seed(t, me.userId, 'genai', 4);

        const response = await t.request(
          '/api/iori/v1/digest-topics',
          send('POST', cookieOf(me), { name: ' 新しい名前 ', description: '新しい説明' }),
        );

        expect(response.status).toBe(201);
        const { topic } = await response.json() as { topic: { topicKey: string } };
        expect(topic).toEqual({
          topicKey: expect.stringMatching(/^custom-[0-9a-f]{8}$/),
          name: '新しい名前',
          description: '新しい説明',
          enabled: true,
          materialWindowHours: null,
          sortOrder: 5,
          embedded: true,
          examples: [],
          excludes: [],
        });
        expect(rowOf(t, me.userId, topic.topicKey)).toMatchObject({
          name: '新しい名前',
          bytes: EMBEDDING_DIMENSIONS * 4,
        });
      });

      it.each([
        ['name がない', { description: '説明' }],
        ['examples が 11 件', { name: '名前', description: '説明', examples: Array.from({ length: 11 }, () => '例') }],
      ])('%s と 400 にして、何も作らない', async (_label, body) => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');

        const response = await t.request('/api/iori/v1/digest-topics', send('POST', me.bearer, body));

        expect(response.status).toBe(400);
        expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_topics').get()).toEqual({ n: 0 });
      });
    });

    describe('PATCH', () => {
      const patch = (
        t: ReturnType<typeof setupReadApi>,
        topicKey: string,
        headers: Record<string, string>,
        body: unknown,
      ) => t.request(`/api/iori/v1/digest-topics/${topicKey}`, send('PATCH', headers, body));

      it('認証なしだと 401 にする', async () => {
        const t = setupReadApi();

        const response = await patch(t, 'genai', { Origin: ORIGIN }, { enabled: false });

        expect(response.status).toBe(401);
      });

      it('write:accounts を満たさない scope のトークンを 403 にし、何も変えない', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('read:statuses');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { enabled: false });

        expect(response.status).toBe(403);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 1 });
      });

      it('Cookie のとき Origin がなければ 403 にし、何も変えない', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', cookieOf(me, null), { enabled: false });

        expect(response.status).toBe(403);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 1 });
      });

      it('name を変えると 200 と更新後のトピックを返し、埋め込みを作り直す', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 3, { embedded: false });

        const response = await patch(t, 'genai', cookieOf(me), { name: '新しい名前' });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          topic: {
            topicKey: 'genai',
            name: '新しい名前',
            description: 'genai の説明',
            enabled: true,
            materialWindowHours: null,
            sortOrder: 3,
            embedded: true,
            examples: [],
            excludes: [],
          },
        });
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ name: '新しい名前', bytes: EMBEDDING_DIMENSIONS * 4 });
      });

      it.each([
        ['excludes に 121 文字の文がある', { excludes: ['あ'.repeat(121)] }],
      ])('%s と 400 にして、何も変えない', async (_label, body) => {
        const stub = createStubEmbedder(EMBEDDING_DIMENSIONS);
        const t = setupReadApi({ textEmbedder: stub.embedder });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, body);

        expect(response.status).toBe(400);
        expect(stub.calls).toHaveLength(0);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ bytes: EMBEDDING_DIMENSIONS * 4 });
      });

      it('enabled だけを変えると、埋め込みを作り直さずに停止する', async () => {
        const stub = createStubEmbedder(EMBEDDING_DIMENSIONS);
        const t = setupReadApi({ textEmbedder: stub.embedder });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { enabled: false });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ topic: { topicKey: 'genai', enabled: false, embedded: true } });
        expect(stub.calls).toHaveLength(0);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 0, bytes: EMBEDDING_DIMENSIONS * 4 });
      });

      it('materialWindowHours だけを変えると、埋め込みを作り直さずに設定し、応答に含める', async () => {
        const stub = createStubEmbedder(EMBEDDING_DIMENSIONS);
        const t = setupReadApi({ textEmbedder: stub.embedder });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { materialWindowHours: 72 });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          topic: { topicKey: 'genai', materialWindowHours: 72, enabled: true, embedded: true },
        });
        expect(stub.calls).toHaveLength(0);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({
          materialWindowHours: 72,
          bytes: EMBEDDING_DIMENSIONS * 4,
        });
      });

      it('materialWindowHours に null を渡すと期間を解除する', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0, { materialWindowHours: 72 });

        const response = await patch(t, 'genai', me.bearer, { materialWindowHours: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ topic: { materialWindowHours: null } });
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ materialWindowHours: null });
      });

      it.each([
        ['23', 23],
        ['文字列', '72'],
      ])('materialWindowHours が %s なら 400 にして、何も変えない', async (_label, value) => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0, { materialWindowHours: 72 });

        const response = await patch(t, 'genai', me.bearer, { materialWindowHours: value, enabled: false });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Validation failed: materialWindowHours' });
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 1, materialWindowHours: 72 });
      });

      it('name と enabled を一緒に変えると、両方を反映する', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { name: '新しい名前', enabled: false });

        expect(await response.json()).toMatchObject({ topic: { name: '新しい名前', enabled: false, embedded: true } });
      });

      it('フォームの enabled=false も受け付ける', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await t.request('/api/iori/v1/digest-topics/genai', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...me.bearer },
          body: 'enabled=false',
        });

        expect(response.status).toBe(200);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 0 });
      });

      it('他のユーザーのトピックは 404 にして、変えない', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        const other = t.seed.addLocalActor('other');
        seed(t, other.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { name: '新しい名前', enabled: false });

        expect(response.status).toBe(404);
        expect(rowOf(t, other.userId, 'genai')).toMatchObject({ name: 'genai の名前', enabled: 1 });
      });

      it.each([
        ['何も渡さない', {}],
        ['enabled が真偽値でない', { enabled: 'maybe' }],
      ])('%s と 400 にして、何も変えない', async (_label, body) => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, body);

        expect(response.status).toBe(400);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({
          name: 'genai の名前',
          enabled: 1,
          bytes: EMBEDDING_DIMENSIONS * 4,
        });
      });

      it('name が不正なら、一緒に渡した enabled も反映しない', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { name: 'あ'.repeat(41), enabled: false });

        expect(response.status).toBe(400);
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ enabled: 1 });
      });
    });
  });

  describe('/api/iori/v1/feed-sources', () => {
    const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
    const seedSource = (
      t: ReturnType<typeof setupReadApi>,
      options: {
        feedSourceId?: string;
        kind?: string;
        url?: string;
        enabled?: boolean;
        lastFetchedAt?: number;
        lastError?: string;
      } = {},
    ) =>
      t.sqlite.prepare(
        'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,etag,lastModified,lastFetchedAt,lastError,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        options.feedSourceId ?? SOURCE_ID,
        options.kind ?? 'rss',
        options.url ?? 'https://example.com/feed.xml',
        'ブログ',
        options.enabled === false ? 0 : 1,
        null,
        null,
        options.lastFetchedAt ?? null,
        options.lastError ?? null,
        1,
      );
    const rowOf = (t: ReturnType<typeof setupReadApi>, feedSourceId = SOURCE_ID) =>
      t.sqlite.prepare('SELECT url, title, enabled FROM feed_sources WHERE feedSourceId = ?').get(feedSourceId);
    const countOf = (t: ReturnType<typeof setupReadApi>) =>
      t.sqlite.prepare('SELECT count(*) AS n FROM feed_sources').get();
    const X_SOURCE_ID = '33333333-3333-4333-8333-333333333333';
    const seedXSource = (t: ReturnType<typeof setupReadApi>, enabled = true) =>
      seedSource(t, { feedSourceId: X_SOURCE_ID, kind: 'x_user', url: 'https://x.com/jack', enabled });
    const signInAsOther = async (t: ReturnType<typeof setupReadApi>, scope: string) => {
      const other = await t.issueUserToken(scope);
      t.seed.addLocalActor('other', other.userId);
      return { sessionId: other.sessionId, bearer: { Authorization: `Bearer ${other.token}` } };
    };
    const send = (method: string, headers: Record<string, string>, body?: unknown) => ({
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookieOf = (me: { sessionId: string }, origin: string | null = ORIGIN) => ({
      Cookie: `sessionId=${me.sessionId}`,
      ...(origin === null ? {} : { Origin: origin }),
    });
    const post = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown) =>
      t.request('/api/iori/v1/feed-sources', send('POST', headers, body));
    const patch = (
      t: ReturnType<typeof setupReadApi>,
      feedSourceId: string,
      headers: Record<string, string>,
      body: unknown,
    ) => t.request(`/api/iori/v1/feed-sources/${feedSourceId}`, send('PATCH', headers, body));

    describe('GET', () => {
      it('認証なしだと 401 にする', async () => {
        const t = setupReadApi();

        const response = await t.request('/api/iori/v1/feed-sources');

        expect(response.status).toBe(401);
      });

      it('read:statuses を満たさない scope のトークンを 403 にする', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await t.request('/api/iori/v1/feed-sources', { headers: me.bearer });

        expect(response.status).toBe(403);
      });

      it('全ユーザー共通の情報源を、取得の状態付きで返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');
        seedSource(t, { lastFetchedAt: Date.UTC(2026, 10, 5, 1), lastError: 'HTTP 500' });
        seedSource(t, {
          feedSourceId: '22222222-2222-4222-8222-222222222222',
          url: 'https://example.com/other.xml',
          enabled: false,
        });

        const response = await t.request('/api/iori/v1/feed-sources', {
          headers: { Cookie: `sessionId=${me.sessionId}` },
        });

        expect(response.status).toBe(200);
        const { sources } = await response.json() as { sources: Array<{ url: string }> };
        expect(sources.toSorted((a, b) => a.url.localeCompare(b.url))).toEqual([
          {
            feedSourceId: SOURCE_ID,
            kind: 'rss',
            url: 'https://example.com/feed.xml',
            title: 'ブログ',
            enabled: true,
            lastFetchedAt: '2026-11-05T01:00:00.000Z',
            lastError: 'HTTP 500',
          },
          {
            feedSourceId: '22222222-2222-4222-8222-222222222222',
            kind: 'rss',
            url: 'https://example.com/other.xml',
            title: 'ブログ',
            enabled: false,
            lastFetchedAt: null,
            lastError: null,
          },
        ]);
      });

      it('所有者でないユーザーには x_user の情報源を一覧から除く（Cookie）', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'read:statuses');
        seedSource(t);
        seedXSource(t);

        const response = await t.request('/api/iori/v1/feed-sources', {
          headers: { Cookie: `sessionId=${other.sessionId}` },
        });

        expect(response.status).toBe(200);
        const { sources } = await response.json() as { sources: Array<{ feedSourceId: string; kind: string }> };
        expect(sources.map(({ feedSourceId, kind }) => ({ feedSourceId, kind }))).toEqual([
          { feedSourceId: SOURCE_ID, kind: 'rss' },
        ]);
      });

      it('所有者には x_user の情報源も返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');
        seedSource(t);
        seedXSource(t);

        const response = await t.request('/api/iori/v1/feed-sources', { headers: me.bearer });

        const { sources } = await response.json() as { sources: Array<{ kind: string }> };
        expect(sources.map(({ kind }) => kind).toSorted()).toEqual(['rss', 'x_user']);
      });
    });

    describe('POST', () => {
      const body = { url: 'https://example.com/feed.xml', title: 'ブログ' };

      it('認証なしだと 401 にする', async () => {
        const t = setupReadApi();

        const response = await post(t, { Origin: ORIGIN }, body);

        expect(response.status).toBe(401);
      });

      it('write:accounts を満たさない scope のトークンを 403 にし、何も作らない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await post(t, me.bearer, body);

        expect(response.status).toBe(403);
        expect(countOf(t)).toEqual({ n: 0 });
      });

      it('Cookie のとき Origin がなければ 403 にし、何も作らない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, cookieOf(me, null), body);

        expect(response.status).toBe(403);
        expect(countOf(t)).toEqual({ n: 0 });
      });

      it('201 と追加した情報源を返し、有効な rss として保存する', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, cookieOf(me), { url: ' https://example.com/feed.xml ', title: ' ブログ ' });

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
          source: {
            feedSourceId: expect.any(String),
            kind: 'rss',
            url: 'https://example.com/feed.xml',
            title: 'ブログ',
            enabled: true,
            lastFetchedAt: null,
            lastError: null,
          },
        });
        expect(t.sqlite.prepare('SELECT kind, url, title, enabled FROM feed_sources').all()).toEqual([
          { kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ', enabled: 1 },
        ]);
      });

      it('同じ URL が既にあれば 409 にして、何も増やさない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await post(t, me.bearer, body);

        expect(response.status).toBe(409);
        expect(countOf(t)).toEqual({ n: 1 });
      });

      it('正規化した URL で保存する', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, me.bearer, { url: 'https://EXAMPLE.com:443/feed.xml#top', title: 'ブログ' });

        expect(response.status).toBe(201);
        expect(t.sqlite.prepare('SELECT url FROM feed_sources').all()).toEqual([
          { url: 'https://example.com/feed.xml' },
        ]);
      });

      it.each([
        ['url がない', { title: 'ブログ' }],
        ['url が localhost', { url: 'https://localhost/feed.xml', title: 'ブログ' }],
        ['title が空白だけ', { url: 'https://example.com/feed.xml', title: '  ' }],
      ])('%s と 400 にして、何も作らない', async (_label, invalid) => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, me.bearer, invalid);

        expect(response.status).toBe(400);
        expect(countOf(t)).toEqual({ n: 0 });
      });

      it.each(['https://www.twitter.com/jack'])(
        '所有者の rss の %s は、x_user の登録の有無によらず同じ 400 にする',
        async (url) => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');
          const absent = await post(t, me.bearer, { url, title: 'ブログ' });
          seedXSource(t);

          const present = await post(t, me.bearer, { url, title: 'ブログ' });

          expect(absent.status).toBe(400);
          expect(present.status).toBe(400);
          expect(await present.json()).toEqual(await absent.json());
          expect(countOf(t)).toEqual({ n: 1 });
        },
      );

      it('kind を渡しても無視して rss で保存する', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, me.bearer, { ...body, kind: 'hatena_hotentry' });

        expect(response.status).toBe(201);
        expect(t.sqlite.prepare('SELECT kind FROM feed_sources').all()).toEqual([{ kind: 'rss' }]);
      });

      describe('kind が x_user', () => {
        it('201 と追加した情報源を返し、https://x.com/<ユーザー名> と @<ユーザー名> で保存する', async () => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');

          const response = await post(t, cookieOf(me), { kind: 'x_user', username: ' Kosui_Iwasa ' });

          expect(response.status).toBe(201);
          expect(await response.json()).toEqual({
            source: {
              feedSourceId: expect.any(String),
              kind: 'x_user',
              url: 'https://x.com/kosui_iwasa',
              title: '@Kosui_Iwasa',
              enabled: true,
              lastFetchedAt: null,
              lastError: null,
            },
          });
          expect(
            t.sqlite.prepare('SELECT kind, url, title, enabled FROM feed_sources').all(),
          ).toEqual([
            {
              kind: 'x_user',
              url: 'https://x.com/kosui_iwasa',
              title: '@Kosui_Iwasa',
              enabled: 1,
            },
          ]);
        });

        it.each([
          ['username がない', { kind: 'x_user' }],
          ['username に使えない文字がある', { kind: 'x_user', username: 'jack-x' }],
        ])('%s と 400 にして、何も作らない', async (_label, invalid) => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');

          const response = await post(t, me.bearer, invalid);

          expect(response.status).toBe(400);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('所有者でないユーザーの Cookie は 403 にし、何も作らない', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, cookieOf(other), { kind: 'x_user', username: 'jack' });

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('所有者でないユーザーには、username が無くても 400 ではなく 403 を返す', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, { kind: 'x_user' });

          expect(response.status).toBe(403);
        });

        it('所有者でないユーザーの rss は 403 にし、何も作らない', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, body);

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        });
      });

      it.each([
        ['url が無い', { title: 'ブログ' }],
      ])(
        '所有者でないユーザーが rss を送るとき、%s でも 400 ではなく 403 にし、何も作らない',
        async (_label, invalid) => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, invalid);

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        },
      );
    });

    describe('PATCH', () => {
      it('認証なしだと 401 にする', async () => {
        const t = setupReadApi();

        const response = await patch(t, SOURCE_ID, { Origin: ORIGIN }, { enabled: false });

        expect(response.status).toBe(401);
      });

      it('write:accounts を満たさない scope のトークンを 403 にし、何も変えない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, me.bearer, { enabled: false });

        expect(response.status).toBe(403);
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
      });

      it('Cookie のとき Origin がなければ 403 にし、何も変えない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, cookieOf(me, null), { enabled: false });

        expect(response.status).toBe(403);
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
      });

      it('enabled を false にすると 200 と更新後の情報源を返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, cookieOf(me), { enabled: false });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          source: {
            feedSourceId: SOURCE_ID,
            kind: 'rss',
            url: 'https://example.com/feed.xml',
            title: 'ブログ',
            enabled: false,
            lastFetchedAt: null,
            lastError: null,
          },
        });
        expect(rowOf(t)).toMatchObject({ enabled: 0 });
      });

      it('フォームの enabled=false も受け付ける', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await t.request(`/api/iori/v1/feed-sources/${SOURCE_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...me.bearer },
          body: 'enabled=false',
        });

        expect(response.status).toBe(200);
        expect(rowOf(t)).toMatchObject({ enabled: 0 });
      });

      it('所有者でないユーザーの Cookie は x_user の情報源を変えられず、無い情報源と同じ 404 にする', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'write:accounts');
        seedXSource(t, false);

        const response = await patch(t, X_SOURCE_ID, cookieOf(other), { enabled: true });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Feed source not found' });
        expect(rowOf(t, X_SOURCE_ID)).toMatchObject({ enabled: 0 });
      });

      it('所有者は x_user の情報源の有効・無効を変えられる', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedXSource(t, false);

        const response = await patch(t, X_SOURCE_ID, me.bearer, { enabled: true });

        expect(response.status).toBe(200);
        expect(rowOf(t, X_SOURCE_ID)).toMatchObject({ enabled: 1 });
      });

      it('所有者でないユーザーは rss の情報源を変えられず、404 にする', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'write:accounts');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, other.bearer, { enabled: false });

        expect(response.status).toBe(404);
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
      });

      it.each([
        ['形式の不正な ID', 'missing', { enabled: false }],
        ['形式は正しいが存在しない ID', '22222222-2222-4222-8222-222222222222', { enabled: false }],
        ['存在する情報源への不正な body', SOURCE_ID, { enabled: 'maybe' }],
      ])('所有者でないユーザーが %s で呼んでも 404 にし、何も変えない', async (_label, feedSourceId, invalid) => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'write:accounts');
        seedSource(t);

        const response = await patch(t, feedSourceId, other.bearer, invalid);

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Feed source not found' });
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
      });

      it('無い情報源は 404 にする', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await patch(t, SOURCE_ID, me.bearer, { enabled: false });

        expect(response.status).toBe(404);
      });

      it.each([
        ['何も渡さない', {}],
        ['enabled が真偽値でない', { enabled: 'maybe' }],
      ])('%s と 400 にして、何も変えない', async (_label, invalid) => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, me.bearer, invalid);

        expect(response.status).toBe(400);
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
      });
    });
  });
});
