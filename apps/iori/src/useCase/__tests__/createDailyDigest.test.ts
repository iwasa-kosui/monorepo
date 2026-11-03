import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1ActorResolverByUserId } from '../../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ArticleWithBodyCreatedStore } from '../../adaptor/d1/article/articleWithBodyCreatedStore.ts';
import type { IoriD1Db } from '../../adaptor/d1/client.ts';
import { createD1DigestCreatedStore } from '../../adaptor/d1/digest/digestCreatedStore.ts';
import { createD1DigestHeaderResolverByUserIdAndDigestDate } from '../../adaptor/d1/digest/digestHeaderResolverByUserIdAndDigestDate.ts';
import { createD1DigestPushSentStore } from '../../adaptor/d1/digest/digestPushSentStore.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../../adaptor/d1/digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../../adaptor/d1/feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1NewFeedEntriesResolverByFetchedSince } from '../../adaptor/d1/feedEntry/newFeedEntriesResolverByFetchedSince.ts';
import { createD1RadarFeedEntriesResolverByFetchedSince } from '../../adaptor/d1/feedEntry/radarFeedEntriesResolverByFetchedSince.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../../adaptor/d1/linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import type { WebPushSender } from '../../adaptor/webPush/webPush.ts';
import type { DigestCreatedStore } from '../../domain/digest/digest.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { TextGenerator } from '../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../testing/aiStubs.ts';
import { CreateArticleWithBodyUseCase } from '../createArticleWithBody.ts';
import { CreateDailyDigestUseCase, DIGEST_SUMMARY_MODEL, stripThinkBlocks } from '../createDailyDigest.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type EntryOptions = Readonly<{
  url?: string;
  count?: number | null;
  publishedAt?: number | null;
  fetchedAt?: number;
  description?: string;
}>;

const setup = (
  options: {
    textGenerator?: TextGenerator;
    send?: WebPushSender['send'];
    sleep?: (ms: number) => Promise<void>;
    digestCreatedStore?: (db: IoriD1Db) => DigestCreatedStore;
  } = {},
) => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const clock = { value: NOW };

  const send = vi.fn<WebPushSender['send']>(options.send ?? (() => RA.ok(undefined)));
  const useCase = CreateDailyDigestUseCase.create({
    digestSubscriptionResolverByUserId: createD1DigestSubscriptionResolverByUserId(db),
    digestHeaderResolverByUserIdAndDigestDate: createD1DigestHeaderResolverByUserIdAndDigestDate(db),
    radarFeedEntriesResolverByFetchedSince: createD1RadarFeedEntriesResolverByFetchedSince(db),
    newFeedEntriesResolverByFetchedSince: createD1NewFeedEntriesResolverByFetchedSince(db),
    hatenaTrendsResolverByFetchedSince: createD1HatenaTrendsResolverByFetchedSince(db),
    timelineLinkTrendsResolverByUserId: createD1TimelineLinkTrendsResolverByUserId(db),
    textGenerator: options.textGenerator,
    createArticleWithBodyUseCase: CreateArticleWithBodyUseCase.create({
      actorResolverByUserId: createD1ActorResolverByUserId(db),
      articleWithBodyCreatedStore: createD1ArticleWithBodyCreatedStore(db),
    }),
    digestCreatedStore: (options.digestCreatedStore ?? createD1DigestCreatedStore)(db),
    digestPushSentStore: createD1DigestPushSentStore(db),
    pushSubscriptionsResolverByUserId: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: { send },
    now: () => Instant.orThrow(clock.value),
    sleep: options.sleep ?? (() => new Promise(() => undefined)),
  });

  const addSource = (kind: string) => {
    const feedSourceId = seed.uuid();
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, `https://feeds.example/${feedSourceId}`, kind, 1, 1);
    return feedSourceId;
  };
  const sources = {
    rss: addSource('rss'),
    hotentry: addSource('hatena_hotentry'),
    entrylist: addSource('hatena_entrylist'),
    radar: addSource('thoughtworks_radar'),
  };
  const addEntry = (feedSourceId: string, title: string, entry: EntryOptions = {}) => {
    const feedEntryId = seed.uuid();
    const url = entry.url ?? `https://example.com/${encodeURIComponent(title)}`;
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,hatenaBookmarkCount,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      url,
      title,
      entry.description ?? '',
      entry.publishedAt ?? null,
      entry.count ?? null,
      entry.fetchedAt ?? NOW - HOUR,
    );
    return { feedEntryId, url };
  };
  const addLink = (postId: string, url: string, title: string | null, createdAt: number = NOW - HOUR) =>
    sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(seed.uuid(), postId, url, title, null, null, null, null, createdAt);
  const addPushSubscription = (endpoint: string) =>
    sqlite.prepare(
      'INSERT INTO push_subscriptions(subscriptionId,userId,endpoint,p256dhKey,authKey,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(seed.uuid(), me.userId, endpoint, 'p256dh', 'auth', 1);
  const setSubscription = (enabled: boolean) =>
    sqlite.prepare('INSERT INTO digest_subscriptions(userId,enabled,createdAt,updatedAt) VALUES (?,?,?,?)')
      .run(me.userId, enabled ? 1 : 0, 1, 1);
  const all = (query: string) => sqlite.prepare(query).all();
  const bodies = () =>
    sqlite.prepare('SELECT privateHtml, publicHtml FROM article_bodies').get() as {
      privateHtml: string;
      publicHtml: string;
    };
  const run = async () => {
    const result = await useCase.run({ userId: UserId.orThrow(me.userId) });
    if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.err)}`);
    return result.val;
  };

  return {
    fixture,
    seed,
    me,
    clock,
    send,
    useCase,
    sources,
    addSource,
    addEntry,
    addLink,
    addPushSubscription,
    setSubscription,
    all,
    bodies,
    run,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('CreateDailyDigestUseCase: 材料の選び方', () => {
  it('Radar は直近 24 時間に取得したものから、publishedAt が最も新しい 1 件だけを選ぶ', async () => {
    const t = setup();
    t.addEntry(t.sources.radar, 'Radar Vol. 33', { publishedAt: NOW - 100 * DAY, fetchedAt: NOW - 2 * HOUR });
    t.addEntry(t.sources.radar, 'Radar Vol. 34', { publishedAt: NOW - 3 * HOUR, fetchedAt: NOW - 20 * HOUR });
    t.addEntry(t.sources.radar, 'Radar Vol. 35', { publishedAt: NOW - HOUR, fetchedAt: NOW - 25 * HOUR });

    await t.run();

    const { privateHtml, publicHtml } = t.bodies();
    for (const html of [privateHtml, publicHtml]) {
      expect(html).toContain('Radar Vol. 34');
      expect(html).not.toContain('Radar Vol. 33');
      expect(html).not.toContain('Radar Vol. 35');
    }
  });

  it('Radar の新しい版が無ければ Radar の節を出さない', async () => {
    const t = setup();
    t.addEntry(t.sources.radar, 'Radar Vol. 35', { publishedAt: NOW - 2 * DAY, fetchedAt: NOW - 2 * DAY });

    await t.run();

    expect(t.bodies().privateHtml).not.toContain('Radar');
  });

  it('新着は rss の直近 24 時間から、はてなの件数の多い順、同数なら新しい順、件数が null のものは最後にする', async () => {
    const t = setup();
    t.addEntry(t.sources.rss, 'Count 10', { count: 10, publishedAt: NOW - HOUR });
    t.addEntry(t.sources.rss, 'Count 50', { count: 50, publishedAt: NOW - 5 * HOUR });
    t.addEntry(t.sources.rss, 'Count 50 newer', { count: 50, publishedAt: NOW - HOUR });
    t.addEntry(t.sources.rss, 'Count 0', { count: 0, publishedAt: NOW - HOUR });
    t.addEntry(t.sources.rss, 'Null old', { publishedAt: NOW - 10 * HOUR });
    t.addEntry(t.sources.rss, 'Null new', { publishedAt: NOW - HOUR });
    t.addEntry(t.sources.rss, 'Null unpublished', { publishedAt: null, fetchedAt: NOW - 3 * HOUR });
    t.addEntry(t.sources.rss, 'Too old', { count: 999, fetchedAt: NOW - 25 * HOUR });
    t.addEntry(t.sources.hotentry, 'From hatena hotentry', { count: 1000 });
    t.addEntry(t.sources.radar, 'From radar', { count: 1000 });

    const result = await t.run();

    expect(t.all('SELECT rank, title FROM digest_items ORDER BY rank')).toEqual([
      { rank: 1, title: 'Count 50 newer' },
      { rank: 2, title: 'Count 50' },
      { rank: 3, title: 'Count 10' },
      { rank: 4, title: 'Count 0' },
      { rank: 5, title: 'Null new' },
      { rank: 6, title: 'Null unpublished' },
      { rank: 7, title: 'Null old' },
    ]);
    expect(result.items).toBe(7);
  });

  it('みんなの関心（はてな）は 2 種類の情報源から url の重複を除き、件数の多い順に選び、null は 0 として後ろにする', async () => {
    const t = setup();
    t.addEntry(t.sources.hotentry, 'A from hotentry', { url: 'https://example.com/a', count: 300 });
    t.addEntry(t.sources.entrylist, 'A from entrylist', { url: 'https://example.com/a', count: 350 });
    t.addEntry(t.sources.hotentry, 'B', { url: 'https://example.com/b', count: 200 });
    t.addEntry(t.sources.entrylist, 'C', { url: 'https://example.com/c', count: null });
    t.addEntry(t.sources.hotentry, 'Too old', {
      url: 'https://example.com/old',
      count: 9999,
      fetchedAt: NOW - 25 * HOUR,
    });
    t.addEntry(t.sources.rss, 'From rss', { url: 'https://example.com/rss', count: 9999 });

    await t.run();

    expect(t.all('SELECT kind, rank, url, title, count FROM digest_trends ORDER BY kind, rank')).toEqual([
      { kind: 'hatena', rank: 1, url: 'https://example.com/a', title: 'A from entrylist', count: 350 },
      { kind: 'hatena', rank: 2, url: 'https://example.com/b', title: 'B', count: 200 },
      { kind: 'hatena', rank: 3, url: 'https://example.com/c', title: 'C', count: 0 },
    ]);
  });

  it('みんなの関心（iori）は自分とフォロー中の actor の link を url ごとの共有 actor 数で数え、フォローしていない actor、ミュートした actor、削除済みの投稿、24 時間より前の link を数えない', async () => {
    const t = setup();
    const { seed, me } = t;
    const alice = seed.addRemoteActor('alice');
    const bob = seed.addRemoteActor('bob');
    const carol = seed.addRemoteActor('carol');
    const eve = seed.addRemoteActor('eve');
    const dave = seed.addLocalActor('dave');
    seed.addFollow(me.actorId, alice.actorId);
    seed.addFollow(me.actorId, carol.actorId);
    seed.addFollow(me.actorId, eve.actorId);
    seed.addFollow(me.actorId, dave.actorId);
    seed.addMute(me.userId, carol.actorId);
    const share = (actor: { actorId: string }, url: string, title: string | null, createdAt?: number) => {
      const post = seed.addRemotePost(actor, NOW - HOUR, { timeline: false });
      t.addLink(post.postId, url, title, createdAt);
    };
    const own = seed.addLocalPost(me, NOW - HOUR, { timeline: false });
    t.addLink(own.postId, 'https://example.com/x', 'X title');
    share(alice, 'https://example.com/x', 'X title');
    share(alice, 'https://example.com/x', 'X title');
    share(bob, 'https://example.com/x', 'X title');
    share(alice, 'https://example.com/y', null);
    share(eve, 'https://example.com/y', null);
    share(alice, 'https://example.com/t', 'T title');
    share(bob, 'https://example.com/only-bob', 'Bob');
    share(carol, 'https://example.com/only-carol', 'Carol');
    share(alice, 'https://example.com/old', 'Old', NOW - 25 * HOUR);
    const deleted = seed.addLocalPost(dave, NOW - HOUR, { timeline: false, deletedAt: NOW - 30 * 60 * 1000 });
    t.addLink(deleted.postId, 'https://example.com/deleted', 'Deleted');

    await t.run();

    expect(t.all('SELECT kind, rank, url, title, count FROM digest_trends ORDER BY kind, rank')).toEqual([
      { kind: 'timeline_link', rank: 1, url: 'https://example.com/x', title: 'X title', count: 2 },
      { kind: 'timeline_link', rank: 2, url: 'https://example.com/y', title: 'https://example.com/y', count: 2 },
      { kind: 'timeline_link', rank: 3, url: 'https://example.com/t', title: 'T title', count: 1 },
    ]);
  });

  it('他のユーザーのミュートは数え方に影響しない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const other = t.seed.addLocalActor('other');
    t.seed.addFollow(t.me.actorId, alice.actorId);
    t.seed.addMute(other.userId, alice.actorId);
    t.addLink(t.seed.addRemotePost(alice, NOW - HOUR, { timeline: false }).postId, 'https://example.com/a', 'A');

    await t.run();

    expect(t.all('SELECT url, count FROM digest_trends')).toEqual([{ url: 'https://example.com/a', count: 1 }]);
  });

  it('新着、はてな、iori のタイムラインはそれぞれ最大 10 件にする', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(t.me.actorId, alice.actorId);
    for (let index = 1; index <= 12; index += 1) {
      t.addEntry(t.sources.rss, `Entry ${index}`, { count: index });
      t.addEntry(t.sources.hotentry, `Hot ${index}`, { count: index });
      t.addLink(
        t.seed.addRemotePost(alice, NOW - HOUR, { timeline: false }).postId,
        `https://example.com/link-${String(index).padStart(2, '0')}`,
        `Link ${index}`,
      );
    }

    const result = await t.run();

    expect(result).toMatchObject({ items: 10, trends: 20 });
    expect(t.all('SELECT title FROM digest_items ORDER BY rank').map((row) => row.title)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Entry ${12 - index}`),
    );
    expect(t.all('SELECT count(*) AS n FROM digest_trends WHERE kind = \'hatena\'')).toEqual([{ n: 10 }]);
    expect(t.all('SELECT count(*) AS n FROM digest_trends WHERE kind = \'timeline_link\'')).toEqual([{ n: 10 }]);
  });
});

describe('CreateDailyDigestUseCase: 新着の重複', () => {
  it('同じ url の記事が複数の RSS から来ても 1 件だけ載せ、重複を除いて 10 件にする', async () => {
    const t = setup();
    const otherRss = t.addSource('rss');
    for (let index = 1; index <= 12; index += 1) {
      const url = `https://example.com/same-${index}`;
      t.addEntry(t.sources.rss, `Entry ${index}`, { url, count: index });
      t.addEntry(otherRss, `Entry ${index} copy`, { url, count: index });
    }

    const result = await t.run();

    expect(result.items).toBe(10);
    const urls = t.all('SELECT url FROM digest_items ORDER BY rank').map((row) => row.url);
    expect(new Set(urls).size).toBe(10);
    expect(urls).toEqual(Array.from({ length: 10 }, (_, index) => `https://example.com/same-${12 - index}`));
  });
});

describe('CreateDailyDigestUseCase: 要約', () => {
  it('新着の各項目を、モデル、指示、1,000 文字までの平文の入力で要約し、<think> を除いて保存する', async () => {
    const { generator, calls } = createStubTextGenerator(() => '<think>考え中</think>\n  これは要約です  ');
    const t = setup({ textGenerator: generator });
    t.addEntry(t.sources.rss, 'Title', { count: 2, description: '<p>Hello <b>world</b></p>' });
    t.addEntry(t.sources.rss, 'Long', { count: 1, description: 'あ'.repeat(1500) });

    const result = await t.run();

    expect(result.summarized).toBe(2);
    expect(t.all('SELECT title, summary FROM digest_items ORDER BY rank')).toEqual([
      { title: 'Title', summary: 'これは要約です' },
      { title: 'Long', summary: 'これは要約です' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      model: DIGEST_SUMMARY_MODEL,
      maxOutputTokens: 512,
      input: 'Title\n\nHello world',
    });
    expect((calls[0] as { instruction: string }).instruction).toContain('日本語で3行以内に要約する');
    expect(Array.from((calls[1] as { input: string }).input)).toHaveLength(1000);
    expect(t.bodies().privateHtml).toContain('これは要約です');
    expect(t.bodies().publicHtml).toContain('これは要約です');
  });

  it('AI が無ければ要約せずに作る', async () => {
    const t = setup();
    t.addEntry(t.sources.rss, 'Title', { count: 2 });

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', items: 1, summarized: 0 });
    expect(t.all('SELECT summary FROM digest_items')).toEqual([{ summary: null }]);
  });

  it('一部の項目の要約が失敗しても、その項目の summary を null にして続け、console.error に出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const generate: TextGenerator['generate'] = (request) =>
      request.input.startsWith('Fail') ? RA.err({ type: 'AiError', message: 'boom' }) : RA.ok('good summary');
    const t = setup({ textGenerator: { generate, summarize: () => RA.err({ type: 'AiError', message: 'unused' }) } });
    t.addEntry(t.sources.rss, 'Fail one', { count: 2 });
    t.addEntry(t.sources.rss, 'Good one', { count: 1 });

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', items: 2, summarized: 1 });
    expect(t.all('SELECT title, summary FROM digest_items ORDER BY rank')).toEqual([
      { title: 'Fail one', summary: null },
      { title: 'Good one', summary: 'good summary' },
    ]);
    expect(error).toHaveBeenCalledWith(
      'iori digest: summarizing an entry failed.',
      expect.objectContaining({ message: 'boom' }),
    );
  });

  it('1 件の要約が 30 秒を超えたら、その項目の summary を null にして続け、console.error に出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const generate: TextGenerator['generate'] = (request) =>
      request.input.startsWith('Hang') ? new Promise(() => undefined) : RA.ok('good summary');
    const timers: Array<{ ms: number; fire: () => void }> = [];
    const sleep = (ms: number) => new Promise<void>((resolve) => timers.push({ ms, fire: resolve }));
    const t = setup({
      textGenerator: { generate, summarize: () => RA.err({ type: 'AiError', message: 'unused' }) },
      sleep,
    });
    t.addEntry(t.sources.rss, 'Hang one', { count: 2 });
    t.addEntry(t.sources.rss, 'Good one', { count: 1 });

    const running = t.run();
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    timers.forEach((timer) => timer.fire());
    const result = await running;

    expect(timers.map((timer) => timer.ms)).toEqual([30_000, 30_000]);
    expect(result).toMatchObject({ status: 'created', items: 2, summarized: 1 });
    expect(t.all('SELECT title, summary FROM digest_items ORDER BY rank')).toEqual([
      { title: 'Hang one', summary: null },
      { title: 'Good one', summary: 'good summary' },
    ]);
    expect(error).toHaveBeenCalledWith(
      'iori digest: summarizing an entry timed out.',
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });

  it('<think> だけで本文が空の応答は summary を null にする', async () => {
    const { generator } = createStubTextGenerator(() => '<think>only thinking</think>   ');
    const t = setup({ textGenerator: generator });
    t.addEntry(t.sources.rss, 'Title', { count: 1 });

    const result = await t.run();

    expect(result.summarized).toBe(0);
    expect(t.all('SELECT summary FROM digest_items')).toEqual([{ summary: null }]);
  });
});

describe('stripThinkBlocks', () => {
  it('対になった <think> を除き、前後の空白を削る', () => {
    expect(stripThinkBlocks('<think>a\nb</think>\n要約\n')).toBe('要約');
  });

  it('開きタグが無い </think> は、その後ろだけを残す', () => {
    expect(stripThinkBlocks('考え中の文章</think>要約')).toBe('要約');
  });

  it('閉じていない <think> は、その後ろをすべて除く', () => {
    expect(stripThinkBlocks('要約<think>途中で切れた')).toBe('要約');
  });

  it('<think> が無ければ前後の空白だけを削る', () => {
    expect(stripThinkBlocks('  要約  ')).toBe('要約');
  });
});

describe('CreateDailyDigestUseCase: 保存', () => {
  it('title に日本時間の日付を付けた draft の article と、本文を作る', async () => {
    const t = setup();
    t.addEntry(t.sources.rss, 'Title', { count: 1 });

    const result = await t.run();

    expect(t.all('SELECT articleId, authorUserId, rootPostId, title, status FROM articles')).toEqual([{
      articleId: result.articleId,
      authorUserId: t.me.userId,
      rootPostId: null,
      title: '技術ニュースのダイジェスト 2026-11-05',
      status: 'draft',
    }]);
    expect(t.all('SELECT articleId FROM article_bodies')).toEqual([{ articleId: result.articleId }]);
  });

  it('private には iori のタイムラインとはてなの件数を載せ、public には載せない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(t.me.actorId, alice.actorId);
    t.addLink(
      t.seed.addRemotePost(alice, NOW - HOUR, { timeline: false }).postId,
      'https://example.com/private-link',
      'Private link',
    );
    t.addEntry(t.sources.hotentry, 'Hot entry', { url: 'https://example.com/hot', count: 500 });
    t.addEntry(t.sources.rss, 'News', { count: 77 });

    await t.run();

    const { privateHtml, publicHtml } = t.bodies();
    expect(privateHtml).toContain('Private link');
    expect(privateHtml).toContain('Hot entry');
    expect(privateHtml).toContain('はてなブックマーク 77');
    expect(publicHtml).toContain('News');
    expect(publicHtml).not.toContain('Private link');
    expect(publicHtml).not.toContain('private-link');
    expect(publicHtml).not.toContain('Hot entry');
    expect(publicHtml).not.toContain('77');
  });

  it('digest、items、trends と、digest.created の domain event を保存する', async () => {
    const t = setup();
    const entry = t.addEntry(t.sources.rss, 'News', { url: 'https://example.com/news', count: 5 });
    t.addEntry(t.sources.hotentry, 'Hot', { url: 'https://example.com/hot', count: 9 });

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', items: 1, trends: 1, summarized: 0 });
    expect(t.all('SELECT digestId, userId, digestDate, articleId, createdAt FROM digests')).toEqual([{
      digestId: result.digestId,
      userId: t.me.userId,
      digestDate: '2026-11-05',
      articleId: result.articleId,
      createdAt: NOW,
    }]);
    expect(
      t.all(
        'SELECT digestId, feedEntryId, url, title, rank, score, summary, reasonInterestSourceId, feedback FROM digest_items',
      ),
    ).toEqual([{
      digestId: result.digestId,
      feedEntryId: entry.feedEntryId,
      url: 'https://example.com/news',
      title: 'News',
      rank: 1,
      score: null,
      summary: null,
      reasonInterestSourceId: null,
      feedback: null,
    }]);
    expect(t.all('SELECT digestId, kind, rank, url, title, count FROM digest_trends')).toEqual([{
      digestId: result.digestId,
      kind: 'hatena',
      rank: 1,
      url: 'https://example.com/hot',
      title: 'Hot',
      count: 9,
    }]);
    expect(t.all('SELECT eventName FROM domain_events WHERE aggregateName = \'digest\' ORDER BY eventName')).toEqual([
      { eventName: 'digest.created' },
      { eventName: 'digest.pushSent' },
    ]);
  });

  it('材料が 1 件も無くても digest と article を作る', async () => {
    const t = setup();

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', items: 0, trends: 0, summarized: 0 });
    expect(t.all('SELECT count(*) AS n FROM digests')).toEqual([{ n: 1 }]);
    expect(t.bodies().privateHtml).toContain('載せる記事はありません');
  });

  it('article を作った後に digest の保存が失敗したら、articleId を console.error に出してエラーを返し、article は消さない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup({
      digestCreatedStore: () => ({
        store: () => Promise.reject(new Error('d1 down')),
      }),
    });

    const result = await t.useCase.run({ userId: UserId.orThrow(t.me.userId) });

    const [article] = t.all('SELECT articleId FROM articles') as Array<{ articleId: string }>;
    expect(article).toBeDefined();
    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestStoreFailedError', detail: { articleId: article!.articleId } },
    });
    expect(error).toHaveBeenCalledWith(
      'iori digest: storing the digest failed after the article was created.',
      expect.objectContaining({ articleId: article!.articleId }),
    );
    expect(t.all('SELECT count(*) AS n FROM digests')).toEqual([{ n: 0 }]);
    expect(t.send).not.toHaveBeenCalled();
  });

  it('ユーザーが存在しなければ、何も保存せずに UserNotFoundError を返す', async () => {
    const t = setup();

    const result = await t.useCase.run({ userId: UserId.generate() });

    expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
    expect(t.all('SELECT count(*) AS n FROM digests')).toEqual([{ n: 0 }]);
    expect(t.all('SELECT count(*) AS n FROM articles')).toEqual([{ n: 0 }]);
    expect(t.send).not.toHaveBeenCalled();
  });
});

describe('CreateDailyDigestUseCase: Web Push', () => {
  it('本人の購読すべてに送り、pushSentAt と digest.pushSent を記録する', async () => {
    const t = setup();
    t.addEntry(t.sources.rss, 'One', { count: 2 });
    t.addEntry(t.sources.rss, 'Two', { count: 1 });
    t.addPushSubscription('https://push.example/1');
    t.addPushSubscription('https://push.example/2');

    const result = await t.run();

    expect(result.pushed).toBe(2);
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.send.mock.calls.map(([subscription]) => subscription.endpoint).sort()).toEqual([
      'https://push.example/1',
      'https://push.example/2',
    ]);
    expect(t.send.mock.calls[0]![1]).toEqual({
      title: '今日のダイジェスト',
      body: '新着 2 件',
      url: `/articles/${result.articleId}`,
    });
    expect(t.all('SELECT pushSentAt FROM digests')).toEqual([{ pushSentAt: NOW }]);
    expect(t.all('SELECT eventName FROM domain_events WHERE aggregateName = \'digest\' ORDER BY occurredAt, eventName'))
      .toEqual([{ eventName: 'digest.created' }, { eventName: 'digest.pushSent' }]);
  });

  it('Radar があれば body に Radar の新しい版を含める', async () => {
    const t = setup();
    t.addEntry(t.sources.radar, 'Radar Vol. 34', { publishedAt: NOW - DAY });
    t.addEntry(t.sources.rss, 'One', { count: 2 });
    t.addPushSubscription('https://push.example/1');

    await t.run();

    expect(t.send.mock.calls[0]![1]).toMatchObject({ body: 'Radar の新しい版と新着 1 件' });
  });

  it('1 件でも送れれば pushSentAt を記録し、失敗は console.error に出して続ける', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup({
      send: (subscription) =>
        subscription.endpoint.endsWith('/1')
          ? RA.err({ type: 'SendError', message: 'gone', statusCode: 410 })
          : RA.ok(undefined),
    });
    t.addPushSubscription('https://push.example/1');
    t.addPushSubscription('https://push.example/2');

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', pushed: 1 });
    expect(t.all('SELECT pushSentAt FROM digests')).toEqual([{ pushSentAt: NOW }]);
    expect(error).toHaveBeenCalledWith(
      'iori digest: sending a web push failed.',
      expect.objectContaining({ message: 'gone', statusCode: 410 }),
    );
  });

  it('すべて送れなければ pushSentAt を記録しない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup({ send: () => RA.err({ type: 'SendError', message: 'down' }) });
    t.addPushSubscription('https://push.example/1');

    const result = await t.run();

    expect(result).toMatchObject({ status: 'created', pushed: 0 });
    expect(t.all('SELECT pushSentAt FROM digests')).toEqual([{ pushSentAt: null }]);
    expect(t.all('SELECT count(*) AS n FROM domain_events WHERE eventName = \'digest.pushSent\'')).toEqual([{ n: 0 }]);
  });

  it('購読が 0 件でも pushSentAt を記録する', async () => {
    const t = setup();

    const result = await t.run();

    expect(result.pushed).toBe(0);
    expect(t.send).not.toHaveBeenCalled();
    expect(t.all('SELECT pushSentAt FROM digests')).toEqual([{ pushSentAt: NOW }]);
  });
});

describe('CreateDailyDigestUseCase: 作る条件', () => {
  it('同じ日の 2 回目は何もせずに skipped を返す', async () => {
    const t = setup();
    t.addPushSubscription('https://push.example/1');
    const first = await t.run();

    const second = await t.run();

    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'skipped', items: 0, trends: 0, summarized: 0, pushed: 0 });
    expect(t.all('SELECT count(*) AS n FROM digests')).toEqual([{ n: 1 }]);
    expect(t.all('SELECT count(*) AS n FROM articles')).toEqual([{ n: 1 }]);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('日本時間の日付が変われば、同じ UTC の日でも作る', async () => {
    const t = setup();
    t.clock.value = Date.UTC(2026, 10, 4, 14, 59, 59) as typeof NOW;
    const before = await t.run();
    t.clock.value = Date.UTC(2026, 10, 4, 15, 0, 0) as typeof NOW;
    const after = await t.run();

    expect(before.status).toBe('created');
    expect(after.status).toBe('created');
    expect(t.all('SELECT digestDate FROM digests ORDER BY digestDate')).toEqual([
      { digestDate: '2026-11-04' },
      { digestDate: '2026-11-05' },
    ]);
  });

  it('購読が無効なら、何も作らずに skipped を返す', async () => {
    const t = setup();
    t.setSubscription(false);
    t.addPushSubscription('https://push.example/1');

    const result = await t.run();

    expect(result.status).toBe('skipped');
    expect(t.all('SELECT count(*) AS n FROM digests')).toEqual([{ n: 0 }]);
    expect(t.all('SELECT count(*) AS n FROM articles')).toEqual([{ n: 0 }]);
    expect(t.send).not.toHaveBeenCalled();
  });

  it('購読が有効なら作る', async () => {
    const t = setup();
    t.setSubscription(true);

    expect((await t.run()).status).toBe('created');
  });

  it('購読の行が無ければ有効とみなして作る', async () => {
    const t = setup();

    expect((await t.run()).status).toBe('created');
    expect(t.all('SELECT count(*) AS n FROM digest_subscriptions')).toEqual([{ n: 0 }]);
  });
});
