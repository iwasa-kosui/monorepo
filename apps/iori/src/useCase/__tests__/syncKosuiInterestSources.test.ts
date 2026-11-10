import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1InterestSourceContentChangedStore } from '../../adaptor/d1/interestSource/interestSourceContentChangedStore.ts';
import { createD1InterestSourceCreatedStore } from '../../adaptor/d1/interestSource/interestSourceCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../../adaptor/d1/interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddedStore } from '../../adaptor/d1/interestSource/interestSourceEmbeddedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted } from '../../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindIncludingDeleted.ts';
import { createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding } from '../../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindsPendingEmbedding.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { sha256Hex } from '../../helper/sha256.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { createStubEmbedder } from '../../testing/aiStubs.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';
import { KOSUI_FEED_MAX_ITEMS, KOSUI_FEED_URL, SyncKosuiInterestSourcesUseCase } from '../syncKosuiInterestSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 0));
const POST_URL = 'https://kosui.me/blog/post-a';
const TALK_URL = 'https://kosui.me/talks/talk-a';
const EXTERNAL_URL = 'https://kosui.me/external/external-a';

type FeedItem = Readonly<{ title: string; url: string; description?: string; publishedAt?: string }>;

const feedXml = (items: ReadonlyArray<FeedItem>) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>kosui.me</title>`
  + items.map(({ title, url, description, publishedAt }) =>
    `<item><title>${title}</title><link>${url}</link><guid>${url}</guid>`
    + `<description>${description ?? ''}</description>`
    + (publishedAt === undefined ? '' : `<pubDate>${publishedAt}</pubDate>`)
    + `</item>`
  ).join('')
  + `</channel></rss>`;

const defaultItems: ReadonlyArray<FeedItem> = [
  { title: '記事 A', url: POST_URL, description: '記事の説明', publishedAt: 'Tue, 03 Nov 2026 00:00:00 GMT' },
  { title: '[Talk] 登壇 A', url: TALK_URL, description: '登壇の説明', publishedAt: 'Mon, 02 Nov 2026 00:00:00 GMT' },
  { title: '[External] 寄稿 A', url: EXTERNAL_URL, description: '寄稿の説明' },
];

const markdownOfPost = [
  '---',
  'title: 記事 A',
  '---',
  'import Foo from \'../Foo.astro\';',
  'export const meta = {};',
  '',
  '記事の本文です。',
].join('\n');

const ok = (value: Partial<SafeFetchResult>): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({ status: 200, etag: null, lastModified: null, finalUrl: 'https://example.test/', ...value });

const failed = (message: string): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'network', message });

type Site = {
  feed: Result<SafeFetchResult, SafeFetchError>;
  markdowns: Record<string, Result<SafeFetchResult, SafeFetchError>>;
};

const setup = (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  const me = createMastodonSeed(fixture).addLocalActor('kosui');
  const userId = me.userId as UserId;
  const site: Site = {
    feed: ok({ body: feedXml(defaultItems) }),
    markdowns: { [`${POST_URL}.md`]: ok({ body: markdownOfPost }) },
  };
  const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) =>
    url === KOSUI_FEED_URL ? site.feed : site.markdowns[url] ?? failed(`no such page: ${url}`)
  );
  const stub = createStubEmbedder(1024);
  const clock = { value: NOW };
  const buildUseCase = (
    textEmbedder: TextEmbedder | undefined,
    fetcher: SafeFetcher['fetchText'] = fetchText,
  ) =>
    SyncKosuiInterestSourcesUseCase.create({
      interestSourcesResolverByUserIdAndKindIncludingDeleted:
        createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted(db),
      interestSourcesResolverByUserIdAndKindsPendingEmbedding:
        createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding(db),
      interestSourceCreatedStore: createD1InterestSourceCreatedStore(db),
      interestSourceContentChangedStore: createD1InterestSourceContentChangedStore(db),
      interestSourceDeletedStore: createD1InterestSourceDeletedStore(db),
      interestSourceEmbeddedStore: createD1InterestSourceEmbeddedStore(db),
      safeFetcher: { fetchText: fetcher },
      textEmbedder,
      now: () => Instant.orThrow(clock.value),
    });
  const useCase = buildUseCase(options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder);
  const rows = () =>
    sqlite.prepare(
      'SELECT kind, ref, contentHash, occurredAt, embeddedAt, deletedAt, length(embedding) AS bytes FROM interest_sources ORDER BY kind, ref',
    ).all() as Array<{
      kind: string;
      ref: string;
      contentHash: string;
      occurredAt: number;
      embeddedAt: number | null;
      deletedAt: number | null;
      bytes: number | null;
    }>;
  const rowOf = (ref: string) => rows().find((row) => row.ref === ref)!;
  return { sqlite, userId, site, fetchText, stub, clock, useCase, buildUseCase, rows, rowOf };
};

afterEach(() => vi.restoreAllMocks());

describe('SyncKosuiInterestSourcesUseCase', () => {
  it('種別ごとに新規作成し、その場で埋め込む', async () => {
    const { userId, useCase, stub, rows, rowOf } = setup();

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 3 } });
    expect(rows().map(({ kind, ref }) => [kind, ref])).toEqual([
      ['kosui_external', EXTERNAL_URL],
      ['kosui_post', POST_URL],
      ['kosui_talk', TALK_URL],
    ]);
    expect(rows().every((row) => row.embeddedAt === NOW && row.bytes === 1024 * 4 && row.deletedAt === null)).toBe(
      true,
    );
    expect(rowOf(POST_URL).occurredAt).toBe(Date.UTC(2026, 10, 3));
    expect(rowOf(EXTERNAL_URL).occurredAt).toBe(NOW);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.model).toBe(INTEREST_EMBEDDING_MODEL);
    expect([...(stub.calls[0]?.texts ?? [])].sort()).toEqual([
      '寄稿 A\n寄稿の説明',
      '登壇 A\n登壇の説明',
      '記事 A\n記事の本文です。',
    ].sort());
    expect(rowOf(POST_URL).contentHash).toBe(await sha256Hex('記事 A\n記事の本文です。'));
    expect(rowOf(TALK_URL).contentHash).toBe(await sha256Hex('登壇 A\n登壇の説明'));
  });

  it('記事の .md は 2,000 コードポイントに切る', async () => {
    const { userId, site, useCase, stub } = setup();
    site.markdowns[`${POST_URL}.md`] = ok({ body: `---\na: b\n---\n${'あ'.repeat(3000)}` });

    await useCase.run({ userId });

    const text = stub.calls[0]?.texts.find((candidate) => candidate.startsWith('記事 A\n'));
    expect(Array.from(text ?? '')).toHaveLength(2000);
  });

  it('同じ内容でもう一度走らせても何も変えず、埋め込みもしない', async () => {
    const { userId, useCase, stub } = setup();
    await useCase.run({ userId });

    const second = await useCase.run({ userId });

    expect(second).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 0, embedded: 0 } });
    expect(stub.calls).toHaveLength(1);
  });

  it('本文が変わった記事は contentChanged にして埋め込み直す', async () => {
    const { userId, site, useCase, rowOf, stub } = setup();
    await useCase.run({ userId });
    const before = rowOf(POST_URL).contentHash;
    site.markdowns[`${POST_URL}.md`] = ok({ body: '---\na: b\n---\n書き直した本文' });

    const second = await useCase.run({ userId });

    expect(second).toEqual({ ok: true, val: { created: 0, changed: 1, deleted: 0, embedded: 1 } });
    expect(rowOf(POST_URL).contentHash).not.toBe(before);
    expect(rowOf(POST_URL).embeddedAt).toBe(NOW);
    expect(stub.calls[1]?.texts).toEqual(['記事 A\n書き直した本文']);
  });

  it('feed から消えた項目は deleted にし、再び現れたら一意制約に当たらず復活させる', async () => {
    const { userId, site, useCase, rowOf, clock, sqlite } = setup();
    await useCase.run({ userId });
    site.feed = ok({ body: feedXml(defaultItems.filter((item) => item.url !== TALK_URL)) });
    clock.value = Instant.orThrow(NOW + 1000);

    const second = await useCase.run({ userId });

    expect(second).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 1, embedded: 0 } });
    expect(rowOf(TALK_URL).deletedAt).toBe(NOW + 1000);

    site.feed = ok({ body: feedXml(defaultItems) });
    clock.value = Instant.orThrow(NOW + 2000);
    const third = await useCase.run({ userId });

    expect(third).toEqual({ ok: true, val: { created: 0, changed: 1, deleted: 0, embedded: 1 } });
    expect(rowOf(TALK_URL)).toMatchObject({ deletedAt: null, embeddedAt: NOW + 2000 });
    expect(sqlite.prepare('SELECT count(*) AS n FROM interest_sources').get()).toEqual({ n: 3 });
  });

  it('.md の取得に失敗したら title と description で代用し、warn を出す', async () => {
    const { userId, site, useCase, stub, rowOf } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    site.markdowns = {};

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 3 } });
    expect(stub.calls[0]?.texts).toContain('記事 A\n記事の説明');
    expect(rowOf(POST_URL).contentHash).toBe(await sha256Hex('記事 A\n記事の説明'));
    expect(warn).toHaveBeenCalledWith(
      'iori interest sources: fetching the markdown failed, so the description is used instead.',
      { url: POST_URL, errorMessage: `no such page: ${POST_URL}.md` },
    );
  });

  it('kosui.me の origin でない記事は .md を取らず、title と description を使う', async () => {
    const { userId, site, useCase, fetchText, stub } = setup();
    const externalPostUrl = 'https://example.test/blog/post-x';
    const lookalikeUrl = 'https://kosui.me.example.test/blog/post-y';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    site.feed = ok({
      body: feedXml([
        { title: '外部記事', url: externalPostUrl, description: '外部の説明' },
        { title: '紛らわしい記事', url: lookalikeUrl, description: '紛らわしい説明' },
      ]),
    });

    const result = await useCase.run({ userId });

    expect(result).toMatchObject({ ok: true, val: { created: 2, embedded: 2 } });
    expect(fetchText.mock.calls.map(([url]) => url)).toEqual([KOSUI_FEED_URL]);
    expect([...(stub.calls[0]?.texts ?? [])].sort()).toEqual(
      ['外部記事\n外部の説明', '紛らわしい記事\n紛らわしい説明'].sort(),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('.md の取得に失敗した記事に既存の行があれば、差分から外して行をそのまま残す', async () => {
    const { userId, site, useCase, rows, rowOf, stub } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await useCase.run({ userId });
    const before = rowOf(POST_URL);
    site.markdowns = {};

    const second = await useCase.run({ userId });

    expect(second).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 0, embedded: 0 } });
    expect(rowOf(POST_URL)).toEqual(before);
    expect(rows().every((row) => row.deletedAt === null)).toBe(true);
    expect(stub.calls).toHaveLength(1);
  });

  it('.md の取得に失敗した記事に削除済みの行しかなければ、title と description で復活させる', async () => {
    const { userId, site, useCase, rowOf, clock } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await useCase.run({ userId });
    site.feed = ok({ body: feedXml(defaultItems.filter((item) => item.url !== POST_URL)) });
    clock.value = Instant.orThrow(NOW + 1000);
    await useCase.run({ userId });
    expect(rowOf(POST_URL).deletedAt).toBe(NOW + 1000);
    site.feed = ok({ body: feedXml(defaultItems) });
    site.markdowns = {};
    clock.value = Instant.orThrow(NOW + 2000);

    const third = await useCase.run({ userId });

    expect(third).toEqual({ ok: true, val: { created: 0, changed: 1, deleted: 0, embedded: 1 } });
    expect(rowOf(POST_URL)).toMatchObject({
      deletedAt: null,
      contentHash: await sha256Hex('記事 A\n記事の説明'),
    });
  });

  it('.md は同時に 4 件までしか取らない', async () => {
    const { userId, site, buildUseCase, stub } = setup();
    const items = Array.from({ length: 10 }, (_, i): FeedItem => ({
      title: `記事 ${i}`,
      url: `https://kosui.me/blog/p${i}`,
      description: 'd',
    }));
    site.feed = ok({ body: feedXml(items) });
    let active = 0;
    let peak = 0;
    const fetchText = vi.fn<SafeFetcher['fetchText']>(async (url) => {
      if (url === KOSUI_FEED_URL) return site.feed;
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return ok({ body: 'body' });
    });

    const result = await buildUseCase(stub.embedder, fetchText).run({ userId });

    expect(result).toMatchObject({ ok: true, val: { created: 10 } });
    expect(fetchText).toHaveBeenCalledTimes(11);
    expect(peak).toBe(4);
  });

  it.each([
    ['取得の失敗', () => failed('down')],
    ['解析の失敗', () => ok({ body: '<html>not a feed</html>' })],
    ['本文なし', () => ok({ status: 304 })],
    ['項目が 0 件', () => ok({ body: feedXml([]) })],
  ])('feed の%sでは差分を適用せず、何も削除しない', async (_, makeFeed) => {
    const { userId, site, useCase, rows } = setup();
    await useCase.run({ userId });
    const before = rows();
    site.feed = makeFeed();

    const result = await useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'KosuiFeedUnavailableError' } });
    expect(rows()).toEqual(before);
    expect(rows().every((row) => row.deletedAt === null)).toBe(true);
  });

  it('feed は 100 件までしか読まない', async () => {
    const { userId, site, useCase, rows } = setup();
    const items = Array.from({ length: 120 }, (_, i): FeedItem => ({
      title: `[Talk] 登壇 ${i}`,
      url: `https://kosui.me/talks/t${i}`,
      description: `説明 ${i}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toUTCString(),
    }));
    site.feed = ok({ body: feedXml(items) });

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: KOSUI_FEED_MAX_ITEMS, changed: 0, deleted: 0, embedded: 100 } });
    expect(rows()).toHaveLength(100);
  });

  it('埋め込みに失敗した行は embeddedAt が NULL のまま残り、次の同期で埋め込む', async () => {
    const failing: TextEmbedder = {
      embed: async () => Result.err({ type: 'AiError', message: 'unavailable' }),
    };
    const { userId, useCase, buildUseCase, stub, rows } = setup({ textEmbedder: failing });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const first = await useCase.run({ userId });

    expect(first).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 0 } });
    expect(error).toHaveBeenCalledWith('iori interest sources: embedding the kosui.me entries failed.', {
      errorMessage: 'unavailable',
    });
    expect(rows().every((row) => row.embeddedAt === null && row.bytes === null)).toBe(true);

    const second = await buildUseCase(stub.embedder).run({ userId });

    expect(second).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 0, embedded: 3 } });
    expect(rows().every((row) => row.embeddedAt === NOW && row.bytes === 4096)).toBe(true);
  });

  it('まとめての埋め込みが失敗したら 1 件ずつ埋め込み直し、成功分だけ保存する', async () => {
    const calls: number[] = [];
    const partial: TextEmbedder = {
      embed: async ({ texts }) => {
        calls.push(texts.length);
        if (texts.length > 1) return Result.err({ type: 'AiError', message: 'batch failed' });
        return texts[0]?.startsWith('登壇 A') === true
          ? Result.err({ type: 'AiError', message: 'entry failed' })
          : Result.ok([Array.from({ length: 1024 }, () => 1)]);
      },
    };
    const { userId, useCase, rows } = setup({ textEmbedder: partial });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 2 } });
    expect(calls).toEqual([3, 1, 1, 1]);
    expect(rows().filter((row) => row.embeddedAt === null).map((row) => row.kind)).toEqual(['kosui_talk']);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('iori interest sources: embedding an entry failed.', {
      interestSourceId: expect.any(String),
      kind: 'kosui_talk',
      errorMessage: 'entry failed',
    });
  });

  it('次元が 1024 でないベクトルは書かず、error ログを出して他の行は続ける', async () => {
    const mixed: TextEmbedder = {
      embed: async ({ texts }) =>
        Result.ok(texts.map((text, i) => Array.from({ length: i === 0 ? 8 : 1024 }, () => text.length))),
    };
    const { userId, useCase, rows } = setup({ textEmbedder: mixed });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 2 } });
    expect(error).toHaveBeenCalledWith(
      'iori interest sources: the embedding was not stored.',
      expect.objectContaining({ errorMessage: expect.stringContaining('1024') }),
    );
    expect(rows().filter((row) => row.embeddedAt === null)).toHaveLength(1);
  });

  it('埋め込み器が無ければ埋め込みを飛ばす', async () => {
    const { userId, useCase, rows } = setup({ textEmbedder: null });

    const result = await useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { created: 3, changed: 0, deleted: 0, embedded: 0 } });
    expect(rows().every((row) => row.embeddedAt === null)).toBe(true);
  });
});
