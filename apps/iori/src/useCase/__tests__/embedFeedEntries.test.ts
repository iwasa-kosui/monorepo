import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1FeedEntriesResolverByFetchedSincePendingEmbedding } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFetchedSincePendingEmbedding.ts';
import { createD1FeedEntryEmbeddedStore } from '../../adaptor/d1/feedEntry/feedEntryEmbeddedStore.ts';
import { FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS } from '../../domain/feedEntry/feedEntry.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { createStubEmbedder } from '../../testing/aiStubs.ts';
import {
  EmbedFeedEntriesUseCase,
  FEED_ENTRY_EMBEDDING_BATCH_SIZE,
  FEED_ENTRY_EMBEDDING_MAX_BATCHES,
} from '../embedFeedEntries.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 12));
const FEED_SOURCE_ID = '00000000-0000-4000-8000-0000000000f1';

const setup = (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
    .run(FEED_SOURCE_ID, 'rss', 'https://feeds.example/a', 'feed', 1, 1_000);
  const stub = createStubEmbedder(1024);
  const buildEmbed = (textEmbedder: TextEmbedder | undefined) =>
    EmbedFeedEntriesUseCase.create({
      feedEntriesResolverByFetchedSincePendingEmbedding: createD1FeedEntriesResolverByFetchedSincePendingEmbedding(db),
      feedEntryEmbeddedStore: createD1FeedEntryEmbeddedStore(db),
      textEmbedder,
      now: () => NOW,
    });
  const embed = buildEmbed(options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder);
  const addEntry = (n: number, fetchedAt: number = NOW - HOUR_MS, title = `title ${n}`, description = `desc ${n}`) => {
    const feedEntryId = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,fetchedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(feedEntryId, FEED_SOURCE_ID, `guid-${n}`, `https://example.com/${n}`, title, description, fetchedAt);
    return feedEntryId;
  };
  const pendingCount = () =>
    (sqlite.prepare('SELECT count(*) AS n FROM feed_entries WHERE embeddedAt IS NULL').get() as { n: number }).n;
  const embeddedRows = () =>
    sqlite.prepare(
      'SELECT feedEntryId, embeddedAt, length(embedding) AS bytes FROM feed_entries WHERE embeddedAt IS NOT NULL',
    )
      .all() as Array<{ feedEntryId: string; embeddedAt: number; bytes: number }>;
  return { sqlite, stub, embed, buildEmbed, addEntry, pendingCount, embeddedRows };
};

afterEach(() => vi.restoreAllMocks());

describe('EmbedFeedEntriesUseCase', () => {
  it('直近 48 時間の未埋め込みの記事を title と description から 1 回で embed して書き、もう一度走らせても何もしない', async () => {
    const { stub, embed, addEntry, embeddedRows } = setup();
    const inside = addEntry(1, NOW - 47 * HOUR_MS, 'タイトル', '説明');
    addEntry(2, NOW - 49 * HOUR_MS);

    expect(await embed.run()).toEqual({ ok: true, val: { embedded: 1, skipped: 0, remaining: 0 } });

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.model).toBe(INTEREST_EMBEDDING_MODEL);
    expect(stub.calls[0]?.texts).toEqual(['タイトル\n説明']);
    expect(embeddedRows()).toEqual([{ feedEntryId: inside, embeddedAt: NOW, bytes: 4096 }]);

    expect(await embed.run()).toEqual({ ok: true, val: { embedded: 0, skipped: 0, remaining: 0 } });
    expect(stub.calls).toHaveLength(1);
  });

  it('description の HTML タグを取り除いた平文を、title と結合して埋め込む', async () => {
    const { stub, embed, addEntry } = setup();
    addEntry(1, NOW, 'タイトル', '<p>Hello <b>world</b> &amp; <a href="https://example.com/x">link</a></p>');

    await embed.run();

    expect(stub.calls[0]?.texts).toEqual(['タイトル\nHello world & link']);
  });

  it('文字列は先頭 2,000 コードポイントで切る', async () => {
    const { stub, embed, addEntry } = setup();
    addEntry(1, NOW, '😀'.repeat(1500), 'あ'.repeat(900));

    await embed.run();

    const [text] = stub.calls[0]!.texts;
    expect(Array.from(text!)).toHaveLength(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS);
    expect(text).toBe(`${'😀'.repeat(1500)}\n${'あ'.repeat(499)}`);
  });

  it('1 回の embed は 100 件で、1 回の実行は最大 5 回（500 件）までにして残りは次の回に回す', async () => {
    const { stub, embed, addEntry, pendingCount } = setup();
    for (let n = 1; n <= 520; n += 1) addEntry(n, NOW - n);

    expect(await embed.run()).toEqual({
      ok: true,
      val: { embedded: FEED_ENTRY_EMBEDDING_BATCH_SIZE * FEED_ENTRY_EMBEDDING_MAX_BATCHES, skipped: 0, remaining: 0 },
    });

    expect(stub.calls.map((call) => call.texts.length)).toEqual([100, 100, 100, 100, 100]);
    expect(pendingCount()).toBe(20);
    expect(await embed.run()).toEqual({ ok: true, val: { embedded: 20, skipped: 0, remaining: 0 } });
    expect(pendingCount()).toBe(0);
  });

  it('新しく取得した記事から先に埋め込み、古い記事を次の回に回す', async () => {
    const { stub, embed, addEntry } = setup();
    for (let n = 1; n <= 510; n += 1) addEntry(n, NOW - n * 1000);

    await embed.run();

    const texts = stub.calls.flatMap((call) => [...call.texts]);
    expect(texts).toContain('title 1\ndesc 1');
    expect(texts).toContain('title 500\ndesc 500');
    expect(texts).not.toContain('title 501\ndesc 501');
  });

  it('まとめての埋め込みが失敗したら 1 件ずつ埋め込み直し、一部でも成功すれば ok を返す', async () => {
    const calls: number[] = [];
    const partial: TextEmbedder = {
      embed: async ({ texts }) => {
        calls.push(texts.length);
        if (texts.length > 1 || texts[0]?.startsWith('title 2')) {
          return Result.err({ type: 'AiError', message: 'unavailable' });
        }
        return Result.ok([Array.from({ length: 1024 }, () => 1)]);
      },
    };
    const { buildEmbed, addEntry, pendingCount } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let n = 1; n <= 3; n += 1) addEntry(n);

    expect(await buildEmbed(partial).run()).toEqual({ ok: true, val: { embedded: 2, skipped: 1, remaining: 0 } });

    expect(calls).toEqual([3, 1, 1, 1]);
    expect(pendingCount()).toBe(1);
    expect(error).toHaveBeenCalledWith(
      'iori feed entries: embedding an entry failed.',
      expect.objectContaining({ errorMessage: 'unavailable' }),
    );
  });

  it('次元が 1024 でないベクトルは書かず、error ログを出して他は続ける', async () => {
    const mixed: TextEmbedder = {
      embed: async ({ texts }) =>
        Result.ok(texts.map((text, i) => Array.from({ length: i === 1 ? 512 : 1024 }, () => text.length))),
    };
    const { buildEmbed, addEntry, pendingCount } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let n = 1; n <= 3; n += 1) addEntry(n);

    expect(await buildEmbed(mixed).run()).toEqual({ ok: true, val: { embedded: 2, skipped: 1, remaining: 0 } });

    expect(error).toHaveBeenCalledWith(
      'iori feed entries: the embedding was not stored.',
      expect.objectContaining({ errorMessage: expect.stringContaining('1024') }),
    );
    expect(pendingCount()).toBe(1);
  });

  it('埋め込み器が無ければ何もしない', async () => {
    const { embed, addEntry, pendingCount } = setup({ textEmbedder: null });
    addEntry(1);

    expect(await embed.run()).toEqual({ ok: true, val: { embedded: 0, skipped: 0, remaining: 0 } });
    expect(pendingCount()).toBe(1);
  });

  it('埋め込みがすべて失敗したら AiError を返し、行を変えない', async () => {
    const failing: TextEmbedder = { embed: async () => Result.err({ type: 'AiError', message: 'unavailable' }) };
    const { buildEmbed, addEntry, pendingCount } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    addEntry(1);

    expect(await buildEmbed(failing).run()).toEqual({ ok: false, err: { type: 'AiError', message: 'unavailable' } });
    expect(pendingCount()).toBe(1);
  });

  it('途中の回で全件失敗しても、書けた分は残して ok を返す', async () => {
    let call = 0;
    const flaky: TextEmbedder = {
      embed: async ({ texts }) =>
        ++call === 1
          ? Result.ok(texts.map(() => Array.from({ length: 1024 }, () => 1)))
          : Result.err({ type: 'AiError', message: 'unavailable' }),
    };
    const { buildEmbed, addEntry, pendingCount } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let n = 1; n <= 150; n += 1) addEntry(n, NOW - n);

    expect(await buildEmbed(flaky).run()).toEqual({ ok: true, val: { embedded: 100, skipped: 50, remaining: 0 } });
    expect(pendingCount()).toBe(50);
  });

  it('途中の回で全件失敗したら、その回の件数を skipped に、まだ試していない件数を remaining に数える', async () => {
    let call = 0;
    const flaky: TextEmbedder = {
      embed: async ({ texts }) =>
        ++call === 1
          ? Result.ok(texts.map(() => Array.from({ length: 1024 }, () => 1)))
          : Result.err({ type: 'AiError', message: 'unavailable' }),
    };
    const { buildEmbed, addEntry, pendingCount } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let n = 1; n <= 250; n += 1) addEntry(n, NOW - n);

    expect(await buildEmbed(flaky).run()).toEqual({ ok: true, val: { embedded: 100, skipped: 100, remaining: 50 } });
    expect(pendingCount()).toBe(150);
  });

  it('前の回の失敗を、後の回の失敗で上書きせずに skipped に足す', async () => {
    let call = 0;
    const flaky: TextEmbedder = {
      embed: async ({ texts }) =>
        ++call === 1
          ? Result.ok(texts.map((_, i) => Array.from({ length: i === 0 ? 512 : 1024 }, () => 1)))
          : Result.err({ type: 'AiError', message: 'unavailable' }),
    };
    const { buildEmbed, addEntry } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let n = 1; n <= 250; n += 1) addEntry(n, NOW - n);

    expect(await buildEmbed(flaky).run()).toEqual({ ok: true, val: { embedded: 99, skipped: 101, remaining: 50 } });
  });

  it('対象が無ければ embed を呼ばない', async () => {
    const { stub, embed } = setup();

    expect(await embed.run()).toEqual({ ok: true, val: { embedded: 0, skipped: 0, remaining: 0 } });
    expect(stub.calls).toEqual([]);
  });
});
