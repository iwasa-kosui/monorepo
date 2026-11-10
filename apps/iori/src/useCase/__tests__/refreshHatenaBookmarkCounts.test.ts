import { Result } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1Db } from '../../adaptor/d1/client.ts';
import { createD1FeedEntriesResolverByFetchedSinceExcludingKinds } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFetchedSinceExcludingKinds.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { domainEventsTable, feedEntriesTable, feedSourcesTable } from '../../adaptor/d1/schema.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import type { FeedSourceKind } from '../../domain/feedSource/feedSource.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { RefreshHatenaBookmarkCountsUseCase } from '../refreshHatenaBookmarkCounts.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 5, 10));
const DAY = 24 * 60 * 60 * 1000;
const ENDPOINT = 'https://bookmark.hatenaapis.com/count/entries';

const ok = (body: unknown): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({
    status: 200,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    etag: null,
    lastModified: null,
    finalUrl: ENDPOINT,
  });

const failed = (message: string): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'network', message });

const setup = (fetchText: SafeFetcher['fetchText']) => {
  const db = createD1Db(createSqliteD1Fixture().binding);
  const sleep = vi.fn(async (_ms: number) => undefined);
  const useCase = RefreshHatenaBookmarkCountsUseCase.create({
    feedEntriesResolverByFetchedSinceExcludingKinds: createD1FeedEntriesResolverByFetchedSinceExcludingKinds(db),
    feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
    safeFetcher: { fetchText },
    sleep,
    now: () => NOW,
  });
  const addSource = async (kind: FeedSourceKind, label: string = kind) => {
    const feedSourceId = randomUUID();
    await db.insert(feedSourcesTable).values({
      feedSourceId,
      kind,
      url: `https://${label}.test/feed`,
      title: label,
      enabled: true,
      createdAt: new Date(NOW),
    });
    return feedSourceId;
  };
  const addEntry = async (
    feedSourceId: string,
    name: string,
    options: { url?: string; ageDays?: number; count?: number | null } = {},
  ) => {
    await db.insert(feedEntriesTable).values({
      feedEntryId: randomUUID(),
      feedSourceId,
      guid: name,
      url: options.url ?? `https://e.test/${name}`,
      title: name,
      description: '',
      hatenaBookmarkCount: options.count ?? null,
      fetchedAt: new Date(NOW - (options.ageDays ?? 0) * DAY),
    });
  };
  const counts = async () =>
    Object.fromEntries(
      (await db.select().from(feedEntriesTable)).map((row) => [row.guid, row.hatenaBookmarkCount]),
    );
  return { db, sleep, useCase, addSource, addEntry, counts };
};

const urlWithEncodedLength = (name: string, length: number): string => {
  const base = `https://e.test/${name}-`;
  return `${base}${'a'.repeat(length - encodeURIComponent(base).length)}`;
};

const urlsOf = (requested: string): string[] => [...new URL(requested).searchParams.getAll('url')];

describe('RefreshHatenaBookmarkCountsUseCase', () => {
  it('targets only rss entries fetched within three days, excluding hatena, radar and x_user sources', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    const hotentry = await addSource('hatena_hotentry');
    const entrylist = await addSource('hatena_entrylist');
    const radar = await addSource('thoughtworks_radar');
    const xUser = await addSource('x_user');
    await addEntry(rss, 'recent');
    await addEntry(rss, 'edge', { ageDays: 3 });
    await addEntry(rss, 'stale', { ageDays: 3.5 });
    await addEntry(hotentry, 'hot');
    await addEntry(entrylist, 'list');
    await addEntry(radar, 'radar');
    await addEntry(xUser, 'post');
    expect((await useCase.run()).val).toEqual({ requested: 2, updated: 0, failedRequests: 0, skipped: 0 });
    const requested = (fetchText.mock.calls[0] as unknown as [string])[0];
    expect(urlsOf(requested).sort()).toEqual(['https://e.test/edge', 'https://e.test/recent']);
  });

  it('takes the newest 150 entries and requests 50 URLs at a time with a pause between calls', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry, sleep } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 160; i += 1) await addEntry(rss, `e${String(i).padStart(3, '0')}`, { ageDays: 0.5 + i / 1000 });
    expect((await useCase.run()).val).toEqual({ requested: 150, updated: 0, failedRequests: 0, skipped: 0 });
    expect(fetchText).toHaveBeenCalledTimes(3);
    const calls = fetchText.mock.calls as unknown as Array<[string, unknown]>;
    expect(calls.map(([requested]) => urlsOf(requested).length)).toEqual([50, 50, 50]);
    expect(calls.flatMap(([requested]) => urlsOf(requested))).not.toContain('https://e.test/e159');
    expect(sleep.mock.calls).toEqual([[3_000], [3_000]]);
    expect(calls[0]![1]).toEqual({ timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 3 });
  });

  it('puts URLs into one request when the whole request URL is exactly 8000 characters', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 5; i += 1) {
      await addEntry(rss, `e${i}`, { url: urlWithEncodedLength(`e${i}`, 1586), ageDays: i / 1000 });
    }
    expect((await useCase.run()).val).toEqual({ requested: 5, updated: 0, failedRequests: 0, skipped: 0 });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect((fetchText.mock.calls[0] as unknown as [string])[0]).toHaveLength(8_000);
  });

  it('starts a new request when adding a URL would push the request URL over 8000 characters', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 5; i += 1) {
      const length = i === 4 ? 1587 : 1586;
      await addEntry(rss, `e${i}`, { url: urlWithEncodedLength(`e${i}`, length), ageDays: i / 1000 });
    }
    expect((await useCase.run()).val).toEqual({ requested: 5, updated: 0, failedRequests: 0, skipped: 0 });
    const calls = fetchText.mock.calls as unknown as Array<[string]>;
    expect(calls.map(([requested]) => urlsOf(requested).length)).toEqual([4, 1]);
    expect(calls.every(([requested]) => requested.length <= 8_000)).toBe(true);
  });

  it('does not request a URL whose encoded length is over 2000 characters', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    const justFits = urlWithEncodedLength('fits', 2_000);
    await addEntry(rss, 'fits', { url: justFits, ageDays: 0 });
    await addEntry(rss, 'long', { url: urlWithEncodedLength('long', 2_001), ageDays: 0.001 });
    expect((await useCase.run()).val).toEqual({ requested: 1, updated: 0, failedRequests: 0, skipped: 1 });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(urlsOf((fetchText.mock.calls[0] as unknown as [string])[0])).toEqual([justFits]);
  });

  it('stops at three requests when splitting by length needs more and does not count the cut URLs', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 10; i += 1) {
      await addEntry(rss, `e${i}`, { url: urlWithEncodedLength(`e${i}`, 2_000), ageDays: i / 1000 });
    }
    expect((await useCase.run()).val).toEqual({ requested: 9, updated: 0, failedRequests: 0, skipped: 1 });
    const calls = fetchText.mock.calls as unknown as Array<[string]>;
    expect(calls.map(([requested]) => urlsOf(requested).length)).toEqual([3, 3, 3]);
  });

  it('builds the request URL with each URL encoded as a url parameter', async () => {
    const fetchText = vi.fn(async () => ok({}));
    const { useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    await addEntry(rss, 'a', { url: 'https://e.test/a?x=1&y=2#frag' });
    await useCase.run();
    expect(fetchText).toHaveBeenCalledWith(
      `${ENDPOINT}?url=${encodeURIComponent('https://e.test/a?x=1&y=2#frag')}`,
      expect.anything(),
    );
  });

  it('updates changed counts, leaves URLs missing from the response alone and skips unchanged counts', async () => {
    const fetchText = vi.fn(async () => ok({ 'https://e.test/a': 5, 'https://e.test/b': 2, 'https://e.test/d': 0 }));
    const { db, useCase, addSource, addEntry, counts } = setup(fetchText);
    const rss = await addSource('rss');
    await addEntry(rss, 'a', { count: 1 });
    await addEntry(rss, 'b', { count: 2 });
    await addEntry(rss, 'c', { count: 7 });
    await addEntry(rss, 'd');
    expect((await useCase.run()).val).toEqual({ requested: 4, updated: 2, failedRequests: 0, skipped: 0 });
    expect(await counts()).toEqual({ a: 5, b: 2, c: 7, d: 0 });
    const events = await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable);
    expect(events.filter((event) => event.name === 'feedEntry.bookmarkCountUpdated')).toHaveLength(2);
  });

  it('updates every row that has the same url', async () => {
    const fetchText = vi.fn(async () => ok({ 'https://e.test/shared': 4 }));
    const { useCase, addSource, addEntry, counts } = setup(fetchText);
    const rss = await addSource('rss');
    const other = await addSource('rss', 'other');
    await addEntry(rss, 'one', { url: 'https://e.test/shared' });
    await addEntry(other, 'two', { url: 'https://e.test/shared', count: 1 });
    expect((await useCase.run()).val).toEqual({ requested: 1, updated: 2, failedRequests: 0, skipped: 0 });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(await counts()).toEqual({ one: 4, two: 4 });
  });

  it('records HTTP, JSON and validation failures per call and keeps going', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [failed('down'), ok('not json'), ok({ x: -1 })];
    const fetchText = vi.fn(async () => responses.shift()!);
    const { useCase, addSource, addEntry, counts } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 150; i += 1) await addEntry(rss, `e${String(i).padStart(3, '0')}`, { ageDays: i / 1000 });
    const result = await useCase.run();
    expect(fetchText).toHaveBeenCalledTimes(3);
    expect(result.val).toEqual({ requested: 150, updated: 0, failedRequests: 3, skipped: 0 });
    expect(error).toHaveBeenCalledTimes(3);
    expect(Object.values(await counts()).every((value) => value === null)).toBe(true);
    error.mockRestore();
  });

  it('keeps going after a failed call and still updates the later batches', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchText = vi.fn(async (requested: string) =>
      urlsOf(requested).includes('https://e.test/e000') ? failed('down') : ok({ 'https://e.test/e099': 3 })
    );
    const { useCase, addSource, addEntry, counts } = setup(fetchText);
    const rss = await addSource('rss');
    for (let i = 0; i < 100; i += 1) await addEntry(rss, `e${String(i).padStart(3, '0')}`, { ageDays: i / 1000 });
    expect((await useCase.run()).val).toEqual({ requested: 100, updated: 1, failedRequests: 1, skipped: 0 });
    expect((await counts()).e099).toBe(3);
    error.mockRestore();
  });

  it('does not call the store when no count changed', async () => {
    const fetchText = vi.fn(async () => ok({ 'https://e.test/a': 1 }));
    const { db, useCase, addSource, addEntry } = setup(fetchText);
    const rss = await addSource('rss');
    await addEntry(rss, 'a', { count: 1 });
    expect((await useCase.run()).val).toEqual({ requested: 1, updated: 0, failedRequests: 0, skipped: 0 });
    expect(await db.select().from(domainEventsTable)).toEqual([]);
    expect(await db.select().from(feedEntriesTable).where(eq(feedEntriesTable.guid, 'a'))).toHaveLength(1);
  });
});
