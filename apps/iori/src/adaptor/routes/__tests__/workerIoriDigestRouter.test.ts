import { describe, expect, it } from 'vitest';

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
});
