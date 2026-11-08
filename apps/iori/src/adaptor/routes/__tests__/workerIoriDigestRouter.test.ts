import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { secondsUntilNextJstDay } from '../../../domain/aiSummary/usageLimit.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import { sha256Hex } from '../../../helper/sha256.ts';
import type { TextEmbedder } from '../../../ports/textEmbedder.ts';
import { createStubEmbedder, createStubTextGenerator } from '../../../testing/aiStubs.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const seedDigest = (
  t: ReturnType<typeof setupReadApi>,
  owner: { userId: string; actorId: string },
  digestDate: string,
  options: { pushSentAt?: number | null; topicKey?: string; itemCount?: number } = {},
) => {
  const digestId = crypto.randomUUID();
  const articleId = crypto.randomUUID();
  t.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, owner.actorId, owner.userId, null, `ダイジェスト ${digestDate}`, 'draft', 1_000, null, null);
  t.sqlite.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
  )
    .run(
      digestId,
      owner.userId,
      digestDate,
      articleId,
      Date.UTC(2026, 10, 4, 21, 30),
      options.pushSentAt ?? null,
      options.topicKey ?? 'summary',
    );
  const insertItem = t.sqlite.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  const itemCount = options.itemCount ?? 2;
  if (itemCount >= 2) {
    insertItem.run(crypto.randomUUID(), digestId, 'entry-2', 'https://example.com/b', 'B', 2, null, null, null, null);
  }
  if (itemCount >= 1) {
    insertItem.run(
      crypto.randomUUID(),
      digestId,
      'entry-1',
      'https://example.com/a',
      'A',
      1,
      0.5,
      '要約 A',
      null,
      null,
    );
  }
  for (let rank = 3; rank <= itemCount; rank += 1) {
    insertItem.run(
      crypto.randomUUID(),
      digestId,
      `entry-${rank}`,
      `https://example.com/${rank}`,
      `Item ${rank}`,
      rank,
      null,
      null,
      null,
      null,
    );
  }
  const insertTrend = t.sqlite.prepare(
    'INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)',
  );
  insertTrend.run(digestId, 'timeline_link', 1, 'https://example.com/t1', 'T1', 3);
  insertTrend.run(digestId, 'hatena', 2, 'https://example.com/h2', 'H2', 20);
  insertTrend.run(digestId, 'hatena', 1, 'https://example.com/h1', 'H1', 90);
  return { digestId, articleId };
};

const seedTopic = (
  t: ReturnType<typeof setupReadApi>,
  owner: { userId: string },
  topicKey: string,
  name: string,
  sortOrder: number,
) =>
  t.sqlite.prepare(
    'INSERT OR IGNORE INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(owner.userId, topicKey, name, `${name}の説明`, null, null, sortOrder, 1, 1, 1);

const expectedDigest = (digestDate: string, ids: { digestId: string; articleId: string }) => ({
  digest: {
    digestId: ids.digestId,
    digestDate,
    articleId: ids.articleId,
    topicKey: 'summary',
    createdAt: '2026-11-04T21:30:00.000Z',
    pushSentAt: null,
    items: [
      { rank: 1, url: 'https://example.com/a', title: 'A', summary: '要約 A', feedEntryId: 'entry-1' },
      { rank: 2, url: 'https://example.com/b', title: 'B', summary: null, feedEntryId: 'entry-2' },
    ],
    topics: [],
    trends: {
      timelineLinks: [{ rank: 1, url: 'https://example.com/t1', title: 'T1', count: 3 }],
      hatena: [
        { rank: 1, url: 'https://example.com/h1', title: 'H1', count: 90 },
        { rank: 2, url: 'https://example.com/h2', title: 'H2', count: 20 },
      ],
    },
  },
});

const putSubscription = (headers: Record<string, string>, body: unknown, contentType = 'application/json') => ({
  method: 'PUT',
  headers: { 'Content-Type': contentType, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('iori のダイジェスト API', () => {
  const readPaths = [
    '/api/iori/v1/digests/latest',
    '/api/iori/v1/digests/2026-11-05',
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

  it.each(readPaths)('GET %s は Cookie でも Bearer でも 200 か 404 で返す', async (path) => {
    const t = setupReadApi();
    const me = await t.signIn('read:statuses');
    seedDigest(t, me, '2026-11-05');

    const withCookie = await t.request(path, { headers: { Cookie: `sessionId=${me.sessionId}` } });
    const withBearer = await t.request(path, { headers: me.bearer });

    expect(withCookie.status).toBe(200);
    expect(withBearer.status).toBe(200);
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

  describe('GET /api/iori/v1/digests/:date', () => {
    it('指定した日の digest を items と trends 付きで返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const ids = seedDigest(t, me, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedDigest('2026-11-05', ids));
    });

    it('pushSentAt があれば ISO 8601 で返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDigest(t, me, '2026-11-05', { pushSentAt: Date.UTC(2026, 10, 4, 22, 0) });

      const response = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      expect(((await response.json()) as { digest: { pushSentAt: string } }).digest.pushSentAt).toBe(
        '2026-11-04T22:00:00.000Z',
      );
    });

    it('日付の形式が違うと 400 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/digests/20261105', { headers: me.bearer });

      expect(response.status).toBe(400);
    });

    it('その日の digest がなければ 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDigest(t, me, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/2026-11-06', { headers: me.bearer });

      expect(response.status).toBe(404);
    });

    it('他人の digest は見せずに 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const other = t.seed.addLocalActor('other');
      seedDigest(t, other, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      expect(response.status).toBe(404);
    });
  });

  describe('トピックの digest', () => {
    const seedDay = (t: ReturnType<typeof setupReadApi>, me: { userId: string; actorId: string }, date: string) => {
      seedTopic(t, me, 'genai', '生成 AI とエージェント', 0);
      seedTopic(t, me, 'security', 'セキュリティ', 1);
      seedTopic(t, me, 'design', '設計と開発プロセス', 2);
      const summary = seedDigest(t, me, date, { itemCount: 0 });
      const genai = seedDigest(t, me, date, { topicKey: 'genai', itemCount: 3 });
      const security = seedDigest(t, me, date, { topicKey: 'security', itemCount: 4 });
      const design = seedDigest(t, me, date, { topicKey: 'design', itemCount: 3 });
      return { summary, genai, security, design };
    };

    it('/:date はまとめの digest を返し、トピックの記事を項目数の多い順、同数なら sortOrder の順で付ける', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const ids = seedDay(t, me, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        digest: {
          digestId: ids.summary.digestId,
          articleId: ids.summary.articleId,
          topicKey: 'summary',
          items: [],
          topics: [
            { topicKey: 'security', name: 'セキュリティ', articleId: ids.security.articleId, itemCount: 4 },
            { topicKey: 'genai', name: '生成 AI とエージェント', articleId: ids.genai.articleId, itemCount: 3 },
            { topicKey: 'design', name: '設計と開発プロセス', articleId: ids.design.articleId, itemCount: 3 },
          ],
        },
      });
    });

    it('/latest もまとめの digest を返し、トピックの記事の一覧を付ける', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDay(t, me, '2026-11-04');
      const ids = seedDay(t, me, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });

      const body = await response.json() as {
        digest: { articleId: string; topicKey: string; topics: Array<{ topicKey: string; articleId: string }> };
      };
      expect(body.digest).toMatchObject({ articleId: ids.summary.articleId, topicKey: 'summary' });
      expect(body.digest.topics.map((topic) => topic.articleId)).toEqual([
        ids.security.articleId,
        ids.genai.articleId,
        ids.design.articleId,
      ]);
    });

    it('トピックの digest しかない日は、まとめがないので 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedTopic(t, me, 'genai', '生成 AI とエージェント', 0);
      seedDigest(t, me, '2026-11-05', { topicKey: 'genai', itemCount: 3 });

      const latest = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });
      const byDate = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      expect(latest.status).toBe(404);
      expect(byDate.status).toBe(404);
    });

    it('トピックの定義が消えていても、topicKey を name にして一覧に残す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDigest(t, me, '2026-11-05', { itemCount: 0 });
      const orphan = seedDigest(t, me, '2026-11-05', { topicKey: 'retired', itemCount: 3 });

      const response = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });

      expect(await response.json()).toMatchObject({
        digest: { topics: [{ topicKey: 'retired', name: 'retired', articleId: orphan.articleId, itemCount: 3 }] },
      });
    });

    it('他の日のトピックの記事を一覧に混ぜない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDay(t, me, '2026-11-04');
      const ids = seedDay(t, me, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/2026-11-05', { headers: me.bearer });

      const body = await response.json() as { digest: { topics: Array<{ articleId: string }> } };
      expect(body.digest.topics).toHaveLength(3);
      expect(body.digest.topics.map((topic) => topic.articleId)).not.toContain(ids.summary.articleId);
    });
  });

  describe('GET /api/iori/v1/digests/latest', () => {
    it('digestDate が最も新しい digest を返し、:date としては扱わない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedDigest(t, me, '2026-11-03');
      const latest = seedDigest(t, me, '2026-11-05');
      seedDigest(t, me, '2026-11-04');

      const response = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedDigest('2026-11-05', latest));
    });

    it('digest がなければ 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });

      expect(response.status).toBe(404);
    });

    it('他人の digest しかなければ 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const other = t.seed.addLocalActor('other');
      seedDigest(t, other, '2026-11-05');

      const response = await t.request('/api/iori/v1/digests/latest', { headers: me.bearer });

      expect(response.status).toBe(404);
    });
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

    it('リンクがなければ空の配列を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/trends/links', { headers: me.bearer });

      expect(await response.json()).toEqual({ links: [] });
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

    it('PUT は 2 回目に createdAt を保ち、enabled と updatedAt を更新する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');

      await t.request('/api/iori/v1/digest/subscription', putSubscription(me.bearer, { enabled: false }));
      const first = t.sqlite.prepare('SELECT enabled, createdAt, updatedAt FROM digest_subscriptions').get() as {
        enabled: number;
        createdAt: number;
        updatedAt: number;
      };
      await new Promise((resolve) => setTimeout(resolve, 5));
      await t.request('/api/iori/v1/digest/subscription', putSubscription(me.bearer, { enabled: true }));
      const second = t.sqlite.prepare('SELECT enabled, createdAt, updatedAt FROM digest_subscriptions').all();

      expect(first.enabled).toBe(0);
      expect(second).toHaveLength(1);
      expect(second[0]).toMatchObject({ enabled: 1, createdAt: first.createdAt });
      expect((second[0] as { updatedAt: number }).updatedAt).toBeGreaterThan(first.updatedAt);
      expect(
        t.sqlite.prepare('SELECT eventName FROM domain_events WHERE eventName LIKE \'digestSubscription.%\'').all(),
      )
        .toEqual([{ eventName: 'digestSubscription.saved' }, { eventName: 'digestSubscription.saved' }]);
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

    it.each([{}, { enabled: 'yes' }, { enabled: 1 }, { enabled: null }])('PUT は %j を 400 にする', async (body) => {
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

  describe('POST /api/iori/v1/digests', () => {
    afterEach(() => vi.useRealTimers());

    const freezeNow = () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = Instant.orThrow(Date.now());
      vi.setSystemTime(now);
      return { now, today: Instant.toJstDate(now) };
    };
    const post = (headers: Record<string, string>) => ({ method: 'POST', headers });
    const seedEmbeddedTopic = (t: ReturnType<typeof setupReadApi>, owner: { userId: string }) =>
      t.sqlite.prepare(
        'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        owner.userId,
        'genai',
        '生成 AI',
        '生成 AI の説明',
        new Uint8Array(EMBEDDING_DIMENSIONS * 4),
        1,
        0,
        1,
        1,
        1,
      );
    const insertUsage = (
      t: ReturnType<typeof setupReadApi>,
      userId: string,
      day: string,
      count: number,
      lastRequestedAt: number,
    ) =>
      t.sqlite.prepare('INSERT INTO digest_request_usages(userId,day,count,lastRequestedAt) VALUES (?,?,?,?)')
        .run(userId, day, count, lastRequestedAt);

    it('認証なしだと 401 にする', async () => {
      const t = setupReadApi();

      const response = await t.request('/api/iori/v1/digests', post({}));

      expect(response.status).toBe(401);
    });

    it('write:accounts を満たさない scope のトークンを 403 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(403);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digests').get()).toEqual({ n: 0 });
    });

    it('digest を作って 201 で返し、trigger を requested にして回数を 1 つ数える', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      seedEmbeddedTopic(t, me);
      const { now, today } = freezeNow();

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(201);
      const body = (await response.json()) as { digestId: string; articleId: string };
      expect(body).toEqual({
        digestId: expect.any(String),
        articleId: expect.any(String),
        digestDate: today,
        replaced: false,
      });
      expect(t.sqlite.prepare('SELECT digestId, articleId, userId, trigger, pushSentAt FROM digests').all()).toEqual([
        {
          digestId: body.digestId,
          articleId: body.articleId,
          userId: me.userId,
          trigger: 'requested',
          pushSentAt: null,
        },
      ]);
      expect(t.sqlite.prepare('SELECT status FROM articles WHERE articleId = ?').get(body.articleId)).toEqual({
        status: 'draft',
      });
      expect(t.sqlite.prepare('SELECT day, count, lastRequestedAt FROM digest_request_usages').all()).toEqual([
        { day: today, count: 1, lastRequestedAt: now },
      ]);
    });

    it('埋め込みのある有効なトピックが無ければ 503 にして、何も作らず、回数は予約のまま残す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { today } = freezeNow();

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Digest topics unavailable' });
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digests').get()).toEqual({ n: 0 });
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM articles').get()).toEqual({ n: 0 });
      expect(t.sqlite.prepare('SELECT day, count FROM digest_request_usages').all()).toEqual([{
        day: today,
        count: 1,
      }]);
    });

    it('その日の draft の digest があれば置き換えて、replaced を true にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      seedEmbeddedTopic(t, me);
      const { today } = freezeNow();
      const old = seedDigest(t, me, today);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(201);
      const body = (await response.json()) as { digestId: string; replaced: boolean };
      expect(body.replaced).toBe(true);
      expect(body.digestId).not.toBe(old.digestId);
      expect(t.sqlite.prepare('SELECT digestId FROM digests').all()).toEqual([{ digestId: body.digestId }]);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM articles WHERE articleId = ?').get(old.articleId)).toEqual({
        n: 0,
      });
    });

    it('実行環境の waitUntil に、結果を返すのと同じ生成の Promise を渡す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      seedEmbeddedTopic(t, me);
      freezeNow();
      const waitUntil = vi.fn();

      const response = await t.request('/api/iori/v1/digests', post(me.bearer), { waitUntil } as never);

      expect(response.status).toBe(201);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      expect(waitUntil.mock.calls[0]![0]).toBeInstanceOf(Promise);
    });

    it.each(['published', 'unpublished'])(
      'その日の digest の article が %s なら 409 にして、回数を数えず何も変えない',
      async (status) => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        const { today } = freezeNow();
        const old = seedDigest(t, me, today);
        t.sqlite.prepare('UPDATE articles SET status = ? WHERE articleId = ?').run(status, old.articleId);

        const response = await t.request('/api/iori/v1/digests', post(me.bearer));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Digest already published' });
        expect(t.sqlite.prepare('SELECT digestId FROM digests').all()).toEqual([{ digestId: old.digestId }]);
        expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_request_usages').get()).toEqual({ n: 0 });
      },
    );

    it('その日の digest の draft の本文が編集済みなら 409 にして、回数を数えず何も変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { today } = freezeNow();
      const old = seedDigest(t, me, today);
      t.sqlite.prepare(
        'INSERT INTO article_bodies(articleId,privateHtml,publicHtml,markdown,updatedAt) VALUES (?,?,?,?,?)',
      )
        .run(old.articleId, '<p>edited</p>', '<p>edited</p>', 'edited', 2_000);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Digest draft edited' });
      expect(t.sqlite.prepare('SELECT digestId FROM digests').all()).toEqual([{ digestId: old.digestId }]);
      expect(t.sqlite.prepare('SELECT articleId FROM article_bodies').all()).toEqual([{ articleId: old.articleId }]);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_request_usages').get()).toEqual({ n: 0 });
    });

    it('1 日の上限に達していたら 429 と、翌日までの秒数の Retry-After にして、digest を作らない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { now, today } = freezeNow();
      insertUsage(t, me.userId, today, 3, now - 60 * 60 * 1000);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe(String(secondsUntilNextJstDay(now)));
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digests').get()).toEqual({ n: 0 });
      expect(t.sqlite.prepare('SELECT count FROM digest_request_usages').get()).toEqual({ count: 3 });
    });

    it('前回から 120 秒たっていなければ 409 と、残り秒数の Retry-After にして、digest を作らない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { now, today } = freezeNow();
      insertUsage(t, me.userId, today, 1, now - 30_000);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(409);
      expect(response.headers.get('Retry-After')).toBe('90');
      expect(await response.json()).toEqual({ error: 'Digest request too soon' });
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digests').get()).toEqual({ n: 0 });
      expect(t.sqlite.prepare('SELECT count FROM digest_request_usages').get()).toEqual({ count: 1 });
    });

    it('他人の回数は数えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const other = t.seed.addLocalActor('other');
      seedEmbeddedTopic(t, me);
      const { now, today } = freezeNow();
      insertUsage(t, other.userId, today, 3, now);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(201);
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
    const linkItem = (t: ReturnType<typeof setupReadApi>, digestId: string, rank: number, n: number) =>
      t.sqlite.prepare('UPDATE digest_items SET feedEntryId = ? WHERE digestId = ? AND rank = ?')
        .run(uuidOf(n), digestId, rank);
    const preview = async (t: ReturnType<typeof setupReadApi>, me: { bearer: Record<string, string> }, query = '') =>
      t.request(`${PREVIEW}${query}`, { headers: me.bearer });
    const write = /^\s*(insert|update|delete|replace|create|drop|alter)\b/i;

    it('トークンも Cookie も無いときは 401 にする', async () => {
      const t = setupReadApi();

      const response = await t.request(PREVIEW);

      expect(response.status).toBe(401);
    });

    it.each(['digestDays=0', 'digestDays=31', 'limit=101', 'candidateHours=73'])(
      '?%s は 400 にする',
      async (query) => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await preview(t, me, `?${query}`);

        expect(response.status).toBe(400);
      },
    );

    it('ログイン中のユーザーのテーマ、候補記事の振り分け、ダイジェスト項目の類似度を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const other = t.seed.addLocalActor('other');
      addTopic(t, me.userId, 'genai', 0, { embedding: vec(1, 0, 0) });
      addTopic(t, me.userId, 'platform', 1, { embedding: vec(0, 1, 0) });
      addTopic(t, me.userId, 'draft', 2, { embedding: vec(0, 0, 1), enabled: false });
      addTopic(t, me.userId, 'raw', 3);
      addTopic(t, other.userId, 'security', 0, { embedding: vec(1, 0, 0) });
      const fetchedAt = Date.now() - 2 * HOUR_MS;
      addEntry(t, 1, vec(4, 3, 0), fetchedAt);
      addEntry(t, 3, vec(3, 4, 0), fetchedAt);
      addEntry(t, 4, vec(1, 0, 0), fetchedAt);
      addEntry(t, 5, vec(1, 0, 0), Date.now() - 100 * HOUR_MS);
      addEntry(t, 6, null, fetchedAt);
      linkItem(t, seedDigest(t, me, today(), { topicKey: 'genai', itemCount: 2 }).digestId, 1, 1);
      linkItem(t, seedDigest(t, me, today(), { topicKey: 'platform', itemCount: 1 }).digestId, 1, 1);
      seedDigest(t, me, today());
      seedDigest(t, me, '2020-01-01', { topicKey: 'genai' });
      seedDigest(t, other, today(), { topicKey: 'security' });

      const response = await preview(t, me, '?limit=2');

      expect(response.status).toBe(200);
      const body = await response.json() as {
        topics: unknown;
        thresholds: unknown;
        candidates: { total: number; top1Histogram: Array<{ from: number; count: number }>; byTopic: unknown };
        digestItems: unknown;
      };
      const iso = new Date(fetchedAt).toISOString();
      const candidate = (n: number, similarity: number, second: unknown, margin: number) => ({
        feedEntryId: uuidOf(n),
        title: `記事 ${n}`,
        url: `https://example.com/${uuidOf(n)}`,
        fetchedAt: iso,
        similarity,
        second,
        margin,
        assignment: 'assigned',
      });
      expect(body.topics).toEqual([
        { topicKey: 'genai', name: 'genai の名前', description: 'genai の説明', enabled: true, embedded: true },
        {
          topicKey: 'platform',
          name: 'platform の名前',
          description: 'platform の説明',
          enabled: true,
          embedded: true,
        },
        { topicKey: 'draft', name: 'draft の名前', description: 'draft の説明', enabled: false, embedded: true },
        { topicKey: 'raw', name: 'raw の名前', description: 'raw の説明', enabled: true, embedded: false },
      ]);
      expect(body.thresholds).toEqual({ minSimilarity: 0.4, minMargin: 0 });
      expect(body.candidates.total).toBe(3);
      expect(body.candidates.top1Histogram).toHaveLength(40);
      expect(body.candidates.top1Histogram.filter((bin) => bin.count > 0)).toEqual([
        { from: 0.8, to: 0.85, count: 2 },
        { from: 0.95, to: 1, count: 1 },
      ]);
      expect(body.candidates.byTopic).toEqual([
        {
          topicKey: 'genai',
          count: 2,
          assignedCount: 2,
          top: [
            candidate(4, 1, { topicKey: 'platform', similarity: 0 }, 1),
            candidate(1, 0.8, { topicKey: 'platform', similarity: 0.6 }, 0.2),
          ],
          bottom: [
            candidate(1, 0.8, { topicKey: 'platform', similarity: 0.6 }, 0.2),
            candidate(4, 1, { topicKey: 'platform', similarity: 0 }, 1),
          ],
        },
        {
          topicKey: 'platform',
          count: 1,
          assignedCount: 1,
          top: [candidate(3, 0.8, { topicKey: 'genai', similarity: 0.6 }, 0.2)],
          bottom: [candidate(3, 0.8, { topicKey: 'genai', similarity: 0.6 }, 0.2)],
        },
      ]);
      const adopted = (topicKey: string, rank: number, title: string, url: string, scores: object) => ({
        digestDate: today(),
        topicKey,
        rank,
        title,
        url,
        feedback: null,
        ...scores,
      });
      expect(body.digestItems).toEqual([
        adopted('genai', 1, 'A', 'https://example.com/a', {
          first: { topicKey: 'genai', similarity: 0.8 },
          second: { topicKey: 'platform', similarity: 0.6 },
          margin: 0.2,
          adoptedSimilarity: 0.8,
          matchesFirst: true,
          assignment: 'assigned',
        }),
        adopted('genai', 2, 'B', 'https://example.com/b', {
          first: null,
          second: null,
          margin: null,
          adoptedSimilarity: null,
          matchesFirst: null,
          assignment: 'noComparableTopic',
        }),
        adopted('platform', 1, 'A', 'https://example.com/a', {
          first: { topicKey: 'genai', similarity: 0.8 },
          second: { topicKey: 'platform', similarity: 0.6 },
          margin: 0.2,
          adoptedSimilarity: 0.6,
          matchesFirst: false,
          assignment: 'assigned',
        }),
      ]);
    });

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
      ['candidateHours=73', 'candidateHours'],
      ['candidateHours=abc', 'candidateHours'],
      ['candidateHours=1.5', 'candidateHours'],
      ['candidateHours=', 'candidateHours'],
      ['digestDays=0', 'digestDays'],
      ['digestDays=31', 'digestDays'],
      ['limit=0', 'limit'],
      ['limit=101', 'limit'],
      ['limit=-1', 'limit'],
    ])('?%s は 400 にして、範囲外のパラメーター名を返す', async (query, name) => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await preview(t, me, `?${query}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: `Validation failed: ${name}` });
    });

    it.each(['candidateHours=1', 'candidateHours=72', 'digestDays=1', 'digestDays=30', 'limit=1', 'limit=100'])(
      '?%s は範囲の端として受け付ける',
      async (query) => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await preview(t, me, `?${query}`);

        expect(response.status).toBe(200);
      },
    );

    it('テーマも候補記事もダイジェストも無いときは、空の結果を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await preview(t, me);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        topics: [],
        thresholds: { minSimilarity: 0.4, minMargin: 0 },
        candidates: { total: 0, byTopic: [], truncated: false },
        digestItemsTruncated: false,
        digestItems: [],
      });
    });

    it('埋め込み済みで有効なテーマが無いときも、落ちずに候補の件数とダイジェスト項目を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      addTopic(t, me.userId, 'raw', 0);
      addTopic(t, me.userId, 'draft', 1, { embedding: vec(1, 0, 0), enabled: false });
      addEntry(t, 1, vec(1, 0, 0), Date.now() - HOUR_MS);
      linkItem(t, seedDigest(t, me, today(), { topicKey: 'draft', itemCount: 1 }).digestId, 1, 1);

      const response = await preview(t, me);

      expect(response.status).toBe(200);
      const body = await response.json() as {
        candidates: { total: number; byTopic: unknown[] };
        digestItems: Array<Record<string, unknown>>;
      };
      expect(body.candidates.total).toBe(1);
      expect(body.candidates.byTopic).toEqual([]);
      expect(body.digestItems).toHaveLength(1);
      expect(body.digestItems[0]).toMatchObject({
        topicKey: 'draft',
        first: null,
        adoptedSimilarity: 1,
        matchesFirst: null,
      });
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
    const failingEmbedder: TextEmbedder = { embed: () => RA.err({ type: 'AiError', message: 'boom' }) };
    const seed = (
      t: ReturnType<typeof setupReadApi>,
      userId: string,
      topicKey: string,
      sortOrder: number,
      options: { embedded?: boolean; enabled?: boolean } = {},
    ) =>
      t.sqlite.prepare(
        'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        userId,
        topicKey,
        `${topicKey} の名前`,
        `${topicKey} の説明`,
        options.embedded === false ? null : new Uint8Array(EMBEDDING_DIMENSIONS * 4),
        options.embedded === false ? null : 1,
        sortOrder,
        options.enabled === false ? 0 : 1,
        1,
        1,
      );
    const rowOf = (t: ReturnType<typeof setupReadApi>, userId: string, topicKey: string) =>
      t.sqlite.prepare(
        'SELECT name, description, enabled, embeddedAt, length(embedding) AS bytes FROM digest_topics WHERE userId = ? AND topicKey = ?',
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
              sortOrder: 1,
              embedded: false,
            },
            {
              topicKey: 'platform',
              name: 'platform の名前',
              description: 'platform の説明',
              enabled: false,
              sortOrder: 2,
              embedded: true,
            },
          ],
        });
      });

      it('トピックが無ければ空の配列を返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await t.request('/api/iori/v1/digest-topics', { headers: me.bearer });

        expect(await response.json()).toEqual({ topics: [] });
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
          sortOrder: 5,
          embedded: true,
        });
        expect(rowOf(t, me.userId, topic.topicKey)).toMatchObject({
          name: '新しい名前',
          bytes: EMBEDDING_DIMENSIONS * 4,
        });
      });

      it('埋め込みに失敗しても 201 にして、embedded を false にする', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const t = setupReadApi({ textEmbedder: failingEmbedder });
        const me = await t.signIn('write:accounts');

        const response = await t.request(
          '/api/iori/v1/digest-topics',
          send('POST', me.bearer, { name: '名前', description: '説明' }),
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ topic: { embedded: false } });
      });

      it.each([
        ['name がない', { description: '説明' }],
        ['description がない', { name: '名前' }],
        ['name が空白だけ', { name: '  ', description: '説明' }],
        ['name が 41 文字', { name: 'あ'.repeat(41), description: '説明' }],
        ['description が 301 文字', { name: '名前', description: 'あ'.repeat(301) }],
        ['name が文字列でない', { name: 1, description: '説明' }],
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
            sortOrder: 3,
            embedded: true,
          },
        });
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({ name: '新しい名前', bytes: EMBEDDING_DIMENSIONS * 4 });
      });

      it('description を変えて埋め込みに失敗したら、200 にして embedded を false にする', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const t = setupReadApi({ textEmbedder: failingEmbedder });
        const me = await t.signIn('write:accounts');
        seed(t, me.userId, 'genai', 0);

        const response = await patch(t, 'genai', me.bearer, { description: '新しい説明' });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ topic: { description: '新しい説明', embedded: false } });
        expect(rowOf(t, me.userId, 'genai')).toMatchObject({
          description: '新しい説明',
          embeddedAt: null,
          bytes: null,
        });
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

      it('無いトピックは 404 にする', async () => {
        const t = setupReadApi({ textEmbedder: stubEmbedder() });
        const me = await t.signIn('write:accounts');

        const response = await patch(t, 'missing', me.bearer, { name: '新しい名前' });
        const toggle = await patch(t, 'missing', me.bearer, { enabled: false });

        expect(response.status).toBe(404);
        expect(toggle.status).toBe(404);
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
        ['name が空白だけ', { name: '   ' }],
        ['name が 41 文字', { name: 'あ'.repeat(41) }],
        ['description が 301 文字', { description: 'あ'.repeat(301) }],
        ['enabled が真偽値でない', { enabled: 'maybe' }],
        ['name が文字列でない', { name: 1 }],
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

  describe('POST /api/iori/v1/digest-items/:digestItemId/feedback', () => {
    const itemUrl = 'https://example.com/a';
    const basis = (index: number) =>
      float32ToBytes(Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === index ? 1 : 0)));

    const seedFeedbackDigest = (
      t: ReturnType<typeof setupReadApi>,
      owner: { userId: string; actorId: string },
      options: { embedding?: Uint8Array | null; entry?: boolean } = {},
    ) => {
      const ids = seedDigest(t, owner, '2026-11-05');
      const item = t.sqlite.prepare(
        'SELECT digestItemId, feedEntryId FROM digest_items WHERE digestId = ? AND rank = 1',
      )
        .get(ids.digestId) as { digestItemId: string; feedEntryId: string };
      if (options.entry !== false) {
        t.sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
          .run(`source-${ids.digestId}`, 'rss', `https://example.com/${ids.digestId}.rss`, 'rss', 1, 1_000);
        t.sqlite.prepare(
          'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ).run(
          item.feedEntryId,
          `source-${ids.digestId}`,
          'g1',
          itemUrl,
          'A',
          '',
          null,
          null,
          Date.now(),
          options.embedding === undefined ? basis(0) : options.embedding,
          options.embedding === null ? null : Date.now(),
        );
      }
      return { ...ids, digestItemId: item.digestItemId };
    };

    const post = (digestItemId: string, headers: Record<string, string>, feedback?: string) => ({
      path: `/api/iori/v1/digest-items/${digestItemId}/feedback`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: feedback === undefined ? '' : `feedback=${feedback}`,
      },
    });

    const feedbackOf = (t: ReturnType<typeof setupReadApi>, digestItemId: string) =>
      t.sqlite.prepare('SELECT feedback, feedbackAt FROM digest_items WHERE digestItemId = ?').get(digestItemId) as {
        feedback: string | null;
        feedbackAt: number | null;
      };

    const sourcesOf = (t: ReturnType<typeof setupReadApi>) =>
      t.sqlite.prepare(
        'SELECT interestSourceId, kind, ref, contentHash, weight, occurredAt, deletedAt, embeddedAt, length(embedding) AS bytes FROM interest_sources ORDER BY kind',
      ).all() as Array<{
        interestSourceId: string;
        kind: string;
        ref: string;
        contentHash: string;
        weight: number;
        occurredAt: number;
        deletedAt: number | null;
        embeddedAt: number | null;
        bytes: number | null;
      }>;

    const give = async (
      t: ReturnType<typeof setupReadApi>,
      digestItemId: string,
      headers: Record<string, string>,
      feedback?: string,
    ) => {
      const { path, init } = post(digestItemId, headers, feedback);
      return await t.request(path, init);
    };

    const cookieOf = (me: { sessionId: string }, origin: string | null = ORIGIN) => ({
      Cookie: `sessionId=${me.sessionId}`,
      ...(origin === null ? {} : { Origin: origin }),
    });

    it('認証なしだと 401 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, { Origin: ORIGIN }, 'interested');

      expect(response.status).toBe(401);
      expect(feedbackOf(t, digestItemId).feedback).toBeNull();
    });

    it('write:accounts を満たさない scope のトークンを 403 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, me.bearer, 'interested');

      expect(response.status).toBe(403);
      expect(feedbackOf(t, digestItemId).feedback).toBeNull();
    });

    it('Cookie のとき Origin がなければ 403 にし、何も変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, cookieOf(me, null), 'interested');

      expect(response.status).toBe(403);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      expect(sourcesOf(t)).toEqual([]);
    });

    it('Cookie のとき別の Origin なら 403 にし、何も変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, cookieOf(me, 'https://evil.example'), 'interested');

      expect(response.status).toBe(403);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      expect(sourcesOf(t)).toEqual([]);
    });

    it('Cookie で同じ Origin なら、反応を保存して記事の画面に 303 で戻す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId, articleId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, { ...cookieOf(me), Referer: 'https://evil.example/' }, 'interested');

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`/articles/${articleId}`);
      const saved = feedbackOf(t, digestItemId);
      expect(saved.feedback).toBe('interested');
      expect(saved.feedbackAt).toBeGreaterThan(0);
      expect(
        t.sqlite.prepare('SELECT eventName FROM domain_events WHERE eventName = \'digest.itemFeedbackGiven\'').all(),
      ).toEqual([{ eventName: 'digest.itemFeedbackGiven' }]);
    });

    it('反応した記事の embedding を、記事の URL を ref にした feedback_positive の材料として写す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      await give(t, digestItemId, cookieOf(me), 'interested');

      const feedbackAt = feedbackOf(t, digestItemId).feedbackAt;
      expect(sourcesOf(t)).toEqual([{
        interestSourceId: expect.any(String),
        kind: 'feedback_positive',
        ref: itemUrl,
        contentHash: await sha256Hex(itemUrl),
        weight: 1,
        occurredAt: feedbackAt,
        deletedAt: null,
        embeddedAt: expect.any(Number),
        bytes: EMBEDDING_DIMENSIONS * 4,
      }]);
    });

    it('関心なしは feedback_negative の材料にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      await give(t, digestItemId, cookieOf(me), 'not_interested');

      expect(feedbackOf(t, digestItemId).feedback).toBe('not_interested');
      expect(sourcesOf(t).map(({ kind, deletedAt }) => ({ kind, deletedAt }))).toEqual([
        { kind: 'feedback_negative', deletedAt: null },
      ]);
    });

    it('Bearer でも本人なら保存して 303 で戻す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId, articleId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, me.bearer, 'interested');

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`/articles/${articleId}`);
      expect(feedbackOf(t, digestItemId).feedback).toBe('interested');
    });

    it('JSON の body でも受け付ける', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await t.request(`/api/iori/v1/digest-items/${digestItemId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...me.bearer },
        body: JSON.stringify({ feedback: 'not_interested' }),
      });

      expect(response.status).toBe(303);
      expect(feedbackOf(t, digestItemId).feedback).toBe('not_interested');
    });

    it('他人の項目は 404 にし、DB を変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const other = t.seed.addLocalActor('other');
      const { digestItemId } = seedFeedbackDigest(t, other);

      const withBearer = await give(t, digestItemId, me.bearer, 'interested');
      const withCookie = await give(t, digestItemId, cookieOf(me), 'not_interested');

      expect(withBearer.status).toBe(404);
      expect(withCookie.status).toBe(404);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      expect(sourcesOf(t)).toEqual([]);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM domain_events WHERE eventName LIKE \'digest.%\'').get())
        .toEqual({ n: 0 });
    });

    it.each([crypto.randomUUID(), 'not-a-uuid'])('存在しない ID %s は 404 にする', async (digestItemId) => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, me.bearer, 'interested');

      expect(response.status).toBe(404);
    });

    it.each([undefined, 'maybe', 'INTERESTED', ''])('feedback が %j だと 400 にし、DB を変えない', async (feedback) => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      const response = await give(t, digestItemId, me.bearer, feedback);

      expect(response.status).toBe(400);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      expect(sourcesOf(t)).toEqual([]);
    });

    it('同じ値をもう一度押すと取り消し、材料を論理削除する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      await give(t, digestItemId, cookieOf(me), 'interested');
      const response = await give(t, digestItemId, cookieOf(me), 'interested');

      expect(response.status).toBe(303);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      const sources = sourcesOf(t);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ kind: 'feedback_positive', deletedAt: expect.any(Number) });
    });

    it('別の値を押すと切り替え、反対の kind の材料を論理削除する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      await give(t, digestItemId, cookieOf(me), 'interested');
      await give(t, digestItemId, cookieOf(me), 'not_interested');

      expect(feedbackOf(t, digestItemId).feedback).toBe('not_interested');
      const byKind = Object.fromEntries(sourcesOf(t).map((source) => [source.kind, source]));
      expect(byKind.feedback_positive?.deletedAt).toEqual(expect.any(Number));
      expect(byKind.feedback_negative?.deletedAt).toBeNull();
    });

    it('取り消した材料は、同じ行を復活させて occurredAt と embedding を更新する', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);
      await give(t, digestItemId, cookieOf(me), 'interested');
      const first = sourcesOf(t)[0]!;
      await give(t, digestItemId, cookieOf(me), 'interested');
      t.sqlite.prepare('UPDATE feed_entries SET embedding = ?').run(basis(1));
      await new Promise((resolve) => setTimeout(resolve, 5));

      await give(t, digestItemId, cookieOf(me), 'interested');

      const sources = sourcesOf(t);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        interestSourceId: first.interestSourceId,
        kind: 'feedback_positive',
        deletedAt: null,
      });
      expect(sources[0]!.occurredAt).toBeGreaterThan(first.occurredAt);
      const stored = t.sqlite.prepare('SELECT embedding FROM interest_sources').get() as { embedding: Uint8Array };
      expect(Array.from(stored.embedding)).toEqual(Array.from(basis(1)));
    });

    it('取り消してから切り替えた材料も、削除済みの行を復活させる', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);

      await give(t, digestItemId, cookieOf(me), 'interested');
      await give(t, digestItemId, cookieOf(me), 'not_interested');
      await give(t, digestItemId, cookieOf(me), 'interested');

      const byKind = Object.fromEntries(sourcesOf(t).map((source) => [source.kind, source]));
      expect(sourcesOf(t)).toHaveLength(2);
      expect(byKind.feedback_positive?.deletedAt).toBeNull();
      expect(byKind.feedback_negative?.deletedAt).toEqual(expect.any(Number));
    });

    it.each([
      ['embedding が未計算', { embedding: null }],
      ['feed_entries の行が期限切れで無い', { entry: false }],
    ])('feed_entries に %s ときは、反応だけ保存して材料を作らない', async (_, options) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me, options);

      const response = await give(t, digestItemId, cookieOf(me), 'interested');

      expect(response.status).toBe(303);
      expect(feedbackOf(t, digestItemId).feedback).toBe('interested');
      expect(sourcesOf(t)).toEqual([]);
      expect(warn).toHaveBeenCalledWith('iori digest feedback: the feed entry has no embedding.', {
        digestItemId,
        feedEntryId: 'entry-1',
      });
      warn.mockRestore();
    });

    it('公開済みの記事の項目への反応は 409 にし、digest_items と interest_sources を変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId, articleId } = seedFeedbackDigest(t, me);
      t.sqlite.prepare('UPDATE articles SET status = ?, publishedAt = ? WHERE articleId = ?')
        .run('published', 2_000, articleId);

      const response = await give(t, digestItemId, cookieOf(me), 'interested');

      expect(response.status).toBe(409);
      expect(feedbackOf(t, digestItemId)).toEqual({ feedback: null, feedbackAt: null });
      expect(sourcesOf(t)).toEqual([]);
      expect(
        t.sqlite.prepare('SELECT eventName FROM domain_events WHERE eventName = \'digest.itemFeedbackGiven\'').all(),
      ).toEqual([]);
    });

    it('公開後に非公開へ戻した記事の項目への反応は、303 で受け付ける', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId, articleId } = seedFeedbackDigest(t, me);
      t.sqlite.prepare('UPDATE articles SET status = ?, unpublishedAt = ? WHERE articleId = ?')
        .run('unpublished', 3_000, articleId);

      const response = await give(t, digestItemId, cookieOf(me), 'interested');

      expect(response.status).toBe(303);
      expect(feedbackOf(t, digestItemId).feedback).toBe('interested');
      expect(sourcesOf(t).map(({ kind }) => kind)).toEqual(['feedback_positive']);
    });

    it('埋め込みが無い記事の反応を切り替えると、反対の材料は消す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me);
      await give(t, digestItemId, cookieOf(me), 'interested');
      t.sqlite.prepare('UPDATE feed_entries SET embedding = NULL, embeddedAt = NULL').run();

      await give(t, digestItemId, cookieOf(me), 'not_interested');

      expect(sourcesOf(t).map(({ kind, deletedAt }) => [kind, deletedAt === null])).toEqual([
        ['feedback_positive', false],
      ]);
    });
  });

  describe('POST /api/iori/v1/digest-items/:digestItemId/deep-dive', () => {
    const seedDeepDiveDigest = (t: ReturnType<typeof setupReadApi>, owner: { userId: string; actorId: string }) => {
      const ids = seedDigest(t, owner, '2026-11-05');
      t.sqlite.prepare(
        'INSERT INTO article_bodies(articleId,privateHtml,publicHtml,markdown,updatedAt) VALUES (?,?,?,?,?)',
      )
        .run(ids.articleId, '<p>a</p>', '<p>a</p>', '- [A](https://example.com/a)\n  要約 A', 1_000);
      const item = t.sqlite.prepare('SELECT digestItemId FROM digest_items WHERE digestId = ? AND rank = 1')
        .get(ids.digestId) as { digestItemId: string };
      return item.digestItemId;
    };

    const deepDive = (
      t: ReturnType<typeof setupReadApi>,
      me: { sessionId: string },
      digestItemId: string,
      body: unknown,
    ) =>
      t.request(`/api/iori/v1/digest-items/${digestItemId}/deep-dive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN },
        body: JSON.stringify(body),
      });

    it('存在しない項目は 404 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:statuses');

      const response = await deepDive(t, me, crypto.randomUUID(), { baseUpdatedAt: 1_000 });

      expect(response.status).toBe(404);
    });

    it('他の人の項目は 404 にして、回数を予約しない', async () => {
      const t = setupReadApi();
      const owner = t.seed.addLocalActor('alice');
      const digestItemId = seedDeepDiveDigest(t, owner);
      const me = await t.signIn('write:statuses');

      const response = await deepDive(t, me, digestItemId, { baseUpdatedAt: 1_000 });

      expect(response.status).toBe(404);
      expect(t.sqlite.prepare('SELECT count(*) AS n FROM digest_deep_dive_usages').get()).toEqual({ n: 0 });
    });

    it('本文の版が baseUpdatedAt と違えば 409 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:statuses');
      const digestItemId = seedDeepDiveDigest(t, me);

      const response = await deepDive(t, me, digestItemId, { baseUpdatedAt: 999 });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: '本文が更新されています。読み込み直してください' });
    });

    it('Workers AI が無い環境では 502 にして、本文を変えない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:statuses');
      const digestItemId = seedDeepDiveDigest(t, me);

      const response = await deepDive(t, me, digestItemId, { baseUpdatedAt: 1_000 });

      expect(response.status).toBe(502);
      expect(t.sqlite.prepare('SELECT markdown, updatedAt FROM article_bodies').get()).toEqual({
        markdown: '- [A](https://example.com/a)\n  要約 A',
        updatedAt: 1_000,
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

      it('所有者でないユーザーには x_user の情報源を一覧から除く（トークン）', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'read:statuses');
        seedSource(t);
        seedXSource(t);

        const response = await t.request('/api/iori/v1/feed-sources', { headers: other.bearer });

        const { sources } = await response.json() as { sources: Array<{ kind: string }> };
        expect(sources.map(({ kind }) => kind)).toEqual(['rss']);
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

      it('情報源が無ければ空の配列を返す', async () => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await t.request('/api/iori/v1/feed-sources', { headers: me.bearer });

        expect(await response.json()).toEqual({ sources: [] });
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

      it('Bearer でも 201 にする', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, me.bearer, body);

        expect(response.status).toBe(201);
      });

      it('同じ URL が既にあれば 409 にして、何も増やさない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await post(t, me.bearer, body);

        expect(response.status).toBe(409);
        expect(countOf(t)).toEqual({ n: 1 });
      });

      it.each([
        ['ホストが大文字', 'https://EXAMPLE.com/feed.xml'],
        ['443 番ポートつき', 'https://example.com:443/feed.xml'],
        ['fragment つき', 'https://example.com/feed.xml#top'],
        ['スキームの後に // がない', 'https:example.com/feed.xml'],
      ])('登録済みの URL と %s の URL が同じなら 409 にして、何も増やさない', async (_label, url) => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);

        const response = await post(t, me.bearer, { url, title: 'ブログ' });

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
        ['title がない', { url: 'https://example.com/feed.xml' }],
        ['url が文字列でない', { url: 1, title: 'ブログ' }],
        ['url が URL でない', { url: 'example', title: 'ブログ' }],
        ['url が ftp', { url: 'ftp://example.com/feed.xml', title: 'ブログ' }],
        ['url が javascript', { url: 'javascript:alert(1)', title: 'ブログ' }],
        ['url が http', { url: 'http://example.com/feed.xml', title: 'ブログ' }],
        ['url が localhost', { url: 'https://localhost/feed.xml', title: 'ブログ' }],
        ['url が IPv4', { url: 'https://127.0.0.1/feed.xml', title: 'ブログ' }],
        ['url が IPv6', { url: 'https://[::1]/', title: 'ブログ' }],
        ['url が 10 進の IP', { url: 'https://2130706433/', title: 'ブログ' }],
        ['url が .internal', { url: 'https://db.internal/feed.xml', title: 'ブログ' }],
        ['url が資格情報つき', { url: 'https://user:pass@example.com/feed.xml', title: 'ブログ' }],
        ['url が 2049 文字', { url: `https://example.com/${'a'.repeat(2029)}`, title: 'ブログ' }],
        ['title が空白だけ', { url: 'https://example.com/feed.xml', title: '  ' }],
        ['title が 101 文字', { url: 'https://example.com/feed.xml', title: 'あ'.repeat(101) }],
      ])('%s と 400 にして、何も作らない', async (_label, invalid) => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await post(t, me.bearer, invalid);

        expect(response.status).toBe(400);
        expect(countOf(t)).toEqual({ n: 0 });
      });

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

        it('url と title を渡しても使わない', async () => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');

          const response = await post(t, me.bearer, { ...body, kind: 'x_user', username: 'jack' });

          expect(response.status).toBe(201);
          expect(t.sqlite.prepare('SELECT url, title FROM feed_sources').all()).toEqual([
            { url: 'https://x.com/jack', title: '@jack' },
          ]);
        });

        it('大文字小文字だけが違う同じユーザーが既にあれば 409 にして、何も増やさない', async () => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');
          await post(t, me.bearer, { kind: 'x_user', username: 'Jack' });

          const response = await post(t, me.bearer, { kind: 'x_user', username: 'jACK' });

          expect(response.status).toBe(409);
          expect(countOf(t)).toEqual({ n: 1 });
        });

        it.each([
          ['username がない', { kind: 'x_user' }],
          ['username が文字列でない', { kind: 'x_user', username: 1 }],
          ['username が空白だけ', { kind: 'x_user', username: '  ' }],
          ['username が 16 文字', { kind: 'x_user', username: 'a'.repeat(16) }],
          ['username に使えない文字がある', { kind: 'x_user', username: 'jack-x' }],
          ['username が @ つき', { kind: 'x_user', username: '@jack' }],
          ['username が URL', { kind: 'x_user', username: 'https://x.com/jack' }],
        ])('%s と 400 にして、何も作らない', async (_label, invalid) => {
          const t = setupReadApi();
          const me = await t.signIn('write:accounts');

          const response = await post(t, me.bearer, invalid);

          expect(response.status).toBe(400);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('write:accounts を満たさない scope のトークンを 403 にし、何も作らない', async () => {
          const t = setupReadApi();
          const me = await t.signIn('read:statuses');

          const response = await post(t, me.bearer, { kind: 'x_user', username: 'jack' });

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('所有者でないユーザーの Cookie は 403 にし、何も作らない', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, cookieOf(other), { kind: 'x_user', username: 'jack' });

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('所有者でないユーザーのトークンは 403 にし、何も作らない', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, { kind: 'x_user', username: 'jack' });

          expect(response.status).toBe(403);
          expect(countOf(t)).toEqual({ n: 0 });
        });

        it('所有者でないユーザーには、username が無くても 400 ではなく 403 を返す', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, { kind: 'x_user' });

          expect(response.status).toBe(403);
        });

        it('rss は所有者でなくても追加できる', async () => {
          const t = setupReadApi();
          const other = await signInAsOther(t, 'write:accounts');

          const response = await post(t, other.bearer, body);

          expect(response.status).toBe(201);
          expect(t.sqlite.prepare('SELECT kind FROM feed_sources').all()).toEqual([{ kind: 'rss' }]);
        });
      });
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

      it('無効の情報源を true に戻せる', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t, { enabled: false });

        const response = await patch(t, SOURCE_ID, me.bearer, { enabled: true });

        expect(response.status).toBe(200);
        expect(rowOf(t)).toMatchObject({ enabled: 1 });
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

      it('所有者でないユーザーのトークンは x_user の情報源を変えられない', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'write:accounts');
        seedXSource(t);

        const response = await patch(t, X_SOURCE_ID, other.bearer, { enabled: false });

        expect(response.status).toBe(404);
        expect(rowOf(t, X_SOURCE_ID)).toMatchObject({ enabled: 1 });
      });

      it('所有者は x_user の情報源の有効・無効を変えられる', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedXSource(t, false);

        const response = await patch(t, X_SOURCE_ID, me.bearer, { enabled: true });

        expect(response.status).toBe(200);
        expect(rowOf(t, X_SOURCE_ID)).toMatchObject({ enabled: 1 });
      });

      it('rss の情報源は所有者でなくても変えられる', async () => {
        const t = setupReadApi();
        const other = await signInAsOther(t, 'write:accounts');
        seedSource(t);

        const response = await patch(t, SOURCE_ID, other.bearer, { enabled: false });

        expect(response.status).toBe(200);
        expect(rowOf(t)).toMatchObject({ enabled: 0 });
      });

      it('他の情報源は変えない', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');
        seedSource(t);
        seedSource(t, { feedSourceId: '22222222-2222-4222-8222-222222222222', url: 'https://example.com/other.xml' });

        await patch(t, SOURCE_ID, me.bearer, { enabled: false });

        expect(rowOf(t, '22222222-2222-4222-8222-222222222222')).toMatchObject({ enabled: 1 });
      });

      it('無い情報源は 404 にする', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await patch(t, SOURCE_ID, me.bearer, { enabled: false });

        expect(response.status).toBe(404);
      });

      it('feedSourceId が UUID でなければ 404 にする', async () => {
        const t = setupReadApi();
        const me = await t.signIn('write:accounts');

        const response = await patch(t, 'missing', me.bearer, { enabled: false });

        expect(response.status).toBe(404);
      });

      it.each([
        ['何も渡さない', {}],
        ['enabled が真偽値でない', { enabled: 'maybe' }],
        ['enabled が数値', { enabled: 1 }],
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
