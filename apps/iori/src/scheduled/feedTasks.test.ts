import { RA } from '@iwasa-kosui/result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { defaultFeedSources } from '../domain/feedSource/defaultFeedSources.ts';
import { EMBEDDING_DIMENSIONS } from '../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../domain/interestSource/embeddingBytes.ts';
import { createDailyDigestTask } from './digestTasks.ts';
import { collectFeedsTask } from './feedTasks.ts';
import { type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

const mocks = vi.hoisted(() => ({ fetchText: vi.fn() }));

vi.mock('../adaptor/http/safeFetch.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adaptor/http/safeFetch.ts')>()),
  createSafeFetcher: () => ({ fetchText: mocks.fetchText }),
}));

const FEED_URL = 'https://zenn.dev/feed';
const COLLECT_TIME = Date.UTC(2026, 10, 4, 21, 0);
const DIGEST_TIME = Date.UTC(2026, 10, 4, 21, 30);
const FEED_SOURCE_ID = '00000000-0000-4000-8000-0000000000f1';

const rss = (title: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>feed</title><item><title>${title}</title><link>https://example.com/${title}</link><guid>guid-${title}</guid><description>desc ${title}</description><pubDate>Wed, 04 Nov 2026 20:50:00 GMT</pubDate></item></channel></rss>`;

const rssItems = (titles: ReadonlyArray<string>) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>feed</title>${
    titles.map((title) =>
      `<item><title>${title}</title><link>https://example.com/${title}</link><guid>guid-${title}</guid><description>desc ${title}</description><pubDate>Wed, 04 Nov 2026 20:50:00 GMT</pubDate></item>`
    ).join('')
  }</channel></rss>`;

const basis = (index: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === index ? 1 : 0));

const setup = (options: { ai?: 'working' | 'failing' | 'none'; feedBody?: string } = {}) => {
  const order: string[] = [];
  const fixture = createSqliteD1Fixture();
  const { sqlite, binding } = fixture;
  defaultFeedSources.forEach((source, index) => {
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        source.kind,
        source.url,
        source.title,
        source.url === FEED_URL ? 1 : 0,
        1_000,
      );
  });
  mocks.fetchText.mockImplementation(async (url: string) => {
    order.push(`fetch:${url}`);
    if (url !== FEED_URL) return RA.err({ type: 'SafeFetchError', reason: 'network', message: 'no network in tests' });
    return RA.ok({
      status: 200,
      body: options.feedBody ?? rss('fresh'),
      etag: null,
      lastModified: null,
      finalUrl: url,
      contentType: 'application/rss+xml',
    });
  });
  const run = vi.fn(async (_model: string, inputs: Record<string, unknown>) => {
    if ('messages' in inputs) return { response: 'summary' };
    order.push('embed');
    if (options.ai === 'failing') throw new Error('unavailable');
    return { data: (inputs['text'] as string[]).map(() => basis(0)) };
  });
  const env = { DB: binding, AI: options.ai === 'none' ? undefined : { run } };
  const context = (scheduledTime: number) =>
    ({ env, scheduledTime: new Date(scheduledTime), waitUntil: () => undefined }) as unknown as ScheduledTaskContext;
  const addPendingEntry = () => {
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(FEED_SOURCE_ID, 'rss', 'https://feeds.example/old', 'old', 0, 1_000);
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,fetchedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(
      '00000000-0000-4000-8000-000000000001',
      FEED_SOURCE_ID,
      'old',
      'https://example.com/old',
      'old',
      'd',
      COLLECT_TIME - 3_600_000,
    );
  };
  const embeddedTitles = () =>
    (sqlite.prepare('SELECT title FROM feed_entries WHERE embeddedAt IS NOT NULL ORDER BY title').all() as Array<
      { title: string }
    >).map((row) => row.title);
  return { fixture, order, run, env, context, addPendingEntry, embeddedTitles };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(COLLECT_TIME);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.fetchText.mockReset();
});

describe('scheduledTasks', () => {
  it('3 時間ごとの cron は取得を collectFeeds の中で埋め込むので、埋め込みだけのタスクを持たない', () => {
    const tasks = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!;
    expect(tasks).toContain(collectFeedsTask);
    expect(tasks.map((task) => task.name)).not.toContain('embedFeedEntries');
  });
});

describe('collectFeedsTask', () => {
  it('記事を取得してから、取得したばかりの記事を同じ実行の中で埋め込み、両方のログを出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup();

    await collectFeedsTask.run(t.context(COLLECT_TIME));

    expect(t.run).toHaveBeenCalledWith('@cf/baai/bge-m3', { text: ['fresh\ndesc fresh'] });
    expect(t.order.indexOf('embed')).toBeGreaterThan(t.order.indexOf(`fetch:${FEED_URL}`));
    expect(t.embeddedTitles()).toEqual(['fresh']);
    expect(info).toHaveBeenCalledWith('iori feeds collected.', expect.objectContaining({ collected: 1 }));
    expect(info).toHaveBeenCalledWith('iori feed entries embedded.', { embedded: 1, skipped: 0, remaining: 0 });
  });

  it('前回までの未埋め込みの記事も埋め込む', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup();
    t.addPendingEntry();

    await collectFeedsTask.run(t.context(COLLECT_TIME));

    expect(t.embeddedTitles()).toEqual(['fresh', 'old']);
  });

  it('取得が失敗しても埋め込みを実行し、取得の失敗を投げる', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup();
    t.addPendingEntry();
    const failing = {
      ...t.fixture.binding,
      prepare: (sql: string) => {
        if (/from "feed_sources"/.test(sql)) throw new Error('feed sources unavailable');
        return t.fixture.binding.prepare(sql);
      },
    };
    const context = { ...t.context(COLLECT_TIME), env: { DB: failing, AI: { run: t.run } } };

    await expect(collectFeedsTask.run(context as unknown as ScheduledTaskContext)).rejects.toThrow(
      'feed sources unavailable',
    );

    expect(t.embeddedTitles()).toEqual(['old']);
  });

  describe('X_API_BEARER_TOKEN', () => {
    const addXSource = (t: ReturnType<typeof setup>) =>
      t.fixture.sqlite.prepare(
        'INSERT INTO feed_sources(feedSourceId,kind,url,title,externalUserId,enabled,createdAt) VALUES (?,?,?,?,?,?,?)',
      ).run('00000000-0000-4000-8000-0000000000f2', 'x_user', 'https://x.com/jack', '@jack', '12', 1, 1_000);
    const contextWith = (t: ReturnType<typeof setup>, token: string | undefined) =>
      ({
        ...t.context(COLLECT_TIME),
        env: { ...t.env, ...(token === undefined ? {} : { X_API_BEARER_TOKEN: token }) },
      }) as unknown as ScheduledTaskContext;
    const xCalls = () => mocks.fetchText.mock.calls.filter(([url]) => String(url).startsWith('https://api.x.com/'));

    it.each([['未設定', undefined], ['空文字', '']])(
      '%s のとき X の情報源を、API を呼ばず lastError も書かずに飛ばす',
      async (_label, token) => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const t = setup();
        addXSource(t);

        await collectFeedsTask.run(contextWith(t, token));

        expect(xCalls()).toEqual([]);
        expect(
          t.fixture.sqlite.prepare('SELECT lastError, lastFetchedAt FROM feed_sources WHERE kind = \'x_user\'').get(),
        )
          .toEqual({ lastError: null, lastFetchedAt: null });
      },
    );

    it('設定されているとき Bearer トークンつきで X の API を呼び、投稿を保存する', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const t = setup();
      addXSource(t);
      const feed = mocks.fetchText.getMockImplementation()!;
      mocks.fetchText.mockImplementation(async (url: string, options: unknown) =>
        url.startsWith('https://api.x.com/2/users/12/tweets')
          ? RA.ok({
            status: 200,
            body: JSON.stringify({
              data: [{ id: '77', text: 'hi', created_at: new Date(COLLECT_TIME - 3_600_000).toISOString() }],
            }),
            etag: null,
            lastModified: null,
            finalUrl: url,
          })
          : feed(url, options)
      );

      await collectFeedsTask.run(contextWith(t, 'secret-token'));

      expect(xCalls()).toHaveLength(1);
      expect(xCalls()[0]![1]).toMatchObject({ headers: { Authorization: 'Bearer secret-token' } });
      expect(t.fixture.sqlite.prepare('SELECT guid, url FROM feed_entries WHERE guid = \'77\'').all()).toEqual([
        { guid: '77', url: 'https://x.com/jack/status/77' },
      ]);
    });
  });

  it('埋め込みが失敗したら error ログを出し、取得は成功として投げない', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup({ ai: 'failing' });

    await expect(collectFeedsTask.run(t.context(COLLECT_TIME))).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('iori feed entries: embedding failed.', { errorMessage: 'unavailable' });
    expect(info).toHaveBeenCalledWith('iori feeds collected.', expect.objectContaining({ collected: 1 }));
    expect(t.embeddedTitles()).toEqual([]);
  });

  it('env.AI が無ければ埋め込まずに、件数 0 をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup({ ai: 'none' });

    await collectFeedsTask.run(t.context(COLLECT_TIME));

    expect(t.embeddedTitles()).toEqual([]);
    expect(info).toHaveBeenCalledWith('iori feed entries embedded.', { embedded: 0, skipped: 0, remaining: 0 });
  });

  it('21:00 に取得した記事が、同じ cron の実行の中で埋め込まれ、21:30 の毎朝の生成のトピックの記事のおすすめに入る', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup({ feedBody: rssItems(['fresh1', 'fresh2', 'fresh3']) });
    const seed = createMastodonSeed(t.fixture);
    const me = seed.addLocalActor('kosui');
    t.fixture.sqlite.prepare(
      'INSERT INTO interest_sources(interestSourceId,userId,kind,ref,contentHash,weight,occurredAt,embedding,embeddedAt,deletedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      seed.uuid(),
      me.userId,
      'kosui_post',
      'https://kosui.me/posts/a',
      'a'.repeat(64),
      1,
      COLLECT_TIME - 3_600_000,
      float32ToBytes(Float32Array.from(basis(0))),
      COLLECT_TIME,
      null,
      1,
      1,
    );

    await collectFeedsTask.run(t.context(COLLECT_TIME));
    vi.setSystemTime(DIGEST_TIME);
    await createDailyDigestTask.run(t.context(DIGEST_TIME));

    const items = t.fixture.sqlite.prepare('SELECT title, score FROM digest_items').all() as Array<
      { title: string; score: number }
    >;
    expect(items.map((item) => item.title).sort()).toEqual(['fresh1', 'fresh2', 'fresh3']);
    expect(items[0]!.score).toBeCloseTo(1, 3);
    expect(
      t.fixture.sqlite.prepare('SELECT count(*) AS n FROM digest_topics WHERE embedding IS NOT NULL').get(),
    ).toEqual({ n: 7 });
  });
});
