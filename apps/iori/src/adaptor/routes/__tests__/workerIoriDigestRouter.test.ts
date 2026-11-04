import { afterEach, describe, expect, it, vi } from 'vitest';

import { secondsUntilNextJstDay } from '../../../domain/aiSummary/usageLimit.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import { sha256Hex } from '../../../helper/sha256.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const seedDigest = (
  t: ReturnType<typeof setupReadApi>,
  owner: { userId: string; actorId: string },
  digestDate: string,
  options: { pushSentAt?: number | null } = {},
) => {
  const digestId = crypto.randomUUID();
  const articleId = crypto.randomUUID();
  t.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, owner.actorId, owner.userId, null, `ダイジェスト ${digestDate}`, 'draft', 1_000, null, null);
  t.sqlite.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
  )
    .run(digestId, owner.userId, digestDate, articleId, Date.UTC(2026, 10, 4, 21, 30), options.pushSentAt ?? null);
  const insertItem = t.sqlite.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(crypto.randomUUID(), digestId, 'entry-2', 'https://example.com/b', 'B', 2, null, null, null, null);
  insertItem.run(crypto.randomUUID(), digestId, 'entry-1', 'https://example.com/a', 'A', 1, 0.5, '要約 A', null, null);
  const insertTrend = t.sqlite.prepare(
    'INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)',
  );
  insertTrend.run(digestId, 'timeline_link', 1, 'https://example.com/t1', 'T1', 3);
  insertTrend.run(digestId, 'hatena', 2, 'https://example.com/h2', 'H2', 20);
  insertTrend.run(digestId, 'hatena', 1, 'https://example.com/h1', 'H1', 90);
  return { digestId, articleId };
};

const expectedDigest = (digestDate: string, ids: { digestId: string; articleId: string }) => ({
  digest: {
    digestId: ids.digestId,
    digestDate,
    articleId: ids.articleId,
    createdAt: '2026-11-04T21:30:00.000Z',
    pushSentAt: null,
    items: [
      { rank: 1, url: 'https://example.com/a', title: 'A', summary: '要約 A', feedEntryId: 'entry-1' },
      { rank: 2, url: 'https://example.com/b', title: 'B', summary: null, feedEntryId: 'entry-2' },
    ],
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

    it('その日の draft の digest があれば置き換えて、replaced を true にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
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
      const { now, today } = freezeNow();
      insertUsage(t, other.userId, today, 3, now);

      const response = await t.request('/api/iori/v1/digests', post(me.bearer));

      expect(response.status).toBe(201);
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
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');
      const { digestItemId } = seedFeedbackDigest(t, me, options);

      const response = await give(t, digestItemId, cookieOf(me), 'interested');

      expect(response.status).toBe(303);
      expect(feedbackOf(t, digestItemId).feedback).toBe('interested');
      expect(sourcesOf(t)).toEqual([]);
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
});
