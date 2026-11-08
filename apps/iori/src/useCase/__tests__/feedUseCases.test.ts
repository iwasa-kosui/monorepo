import type { D1Database } from '@cloudflare/workers-types';
import { Result } from '@iwasa-kosui/result';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1Db } from '../../adaptor/d1/client.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntriesResolverByFetchedBefore } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFetchedBefore.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { createD1FeedEntryCollectedStore } from '../../adaptor/d1/feedEntry/feedEntryCollectedStore.ts';
import { createD1FeedEntryExpiredStore } from '../../adaptor/d1/feedEntry/feedEntryExpiredStore.ts';
import { createD1FeedEntryMaxGuidResolverByFeedSourceId } from '../../adaptor/d1/feedEntry/feedEntryMaxGuidResolverByFeedSourceId.ts';
import { createD1AllFeedSourcesResolver } from '../../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceFetchedStore } from '../../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { domainEventsTable, feedEntriesTable, feedSourcesTable } from '../../adaptor/d1/schema.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { defaultFeedSources } from '../../domain/feedSource/defaultFeedSources.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { CollectFeedEntriesUseCase } from '../collectFeedEntries.ts';
import { EnsureDefaultFeedSourcesUseCase } from '../ensureDefaultFeedSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 5, 1));
const DAY = 24 * 60 * 60 * 1000;

const rss = (items: ReadonlyArray<{ guid: string; title: string; count?: number }>) =>
  `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:hatena="h">`
  + items.map(({ guid, title, count }) =>
    `<item rdf:about="${guid}"><title>${title}</title><link>${guid}</link>`
    + (count === undefined ? '' : `<hatena:bookmarkcount>${count}</hatena:bookmarkcount>`)
    + `</item>`
  ).join('')
  + `</rdf:RDF>`;

const ok = (value: Partial<SafeFetchResult>): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({ status: 200, etag: null, lastModified: null, finalUrl: 'https://example.test/', ...value });

const failed = (message: string): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'network', message });

const createSerializedDb = () => {
  const { binding } = createSqliteD1Fixture();
  let tail: Promise<unknown> = Promise.resolve();
  const serialized = {
    prepare: binding.prepare.bind(binding),
    batch: (statements: Parameters<D1Database['batch']>[0]) => {
      const run = tail.then(() => binding.batch(statements));
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return createD1Db(serialized as unknown as D1Database);
};

const setup = (fetchText: SafeFetcher['fetchText'], now: () => Instant = () => NOW) => {
  const db = createSerializedDb();
  const ensure = EnsureDefaultFeedSourcesUseCase.create({
    allFeedSourcesResolver: createD1AllFeedSourcesResolver(db),
    feedSourceCreatedStore: createD1FeedSourceCreatedStore(db),
    now,
  });
  const collect = CollectFeedEntriesUseCase.create({
    feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
    feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
    feedEntriesResolverByFetchedBefore: createD1FeedEntriesResolverByFetchedBefore(db),
    feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
    feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
    feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
    feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
    feedEntryExpiredStore: createD1FeedEntryExpiredStore(db),
    feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
    safeFetcher: { fetchText },
    now,
  });
  return { db, ensure, collect };
};

describe('EnsureDefaultFeedSourcesUseCase', () => {
  it('creates every default source once and does nothing on the second run', async () => {
    const { db, ensure } = setup(vi.fn());
    expect(await ensure.run()).toEqual({ ok: true, val: { created: defaultFeedSources.length } });
    expect(await ensure.run()).toEqual({ ok: true, val: { created: 0 } });
    expect(await db.select({ n: count() }).from(feedSourcesTable)).toEqual([{ n: defaultFeedSources.length }]);
    expect(
      await db.select({ n: count() }).from(domainEventsTable).where(
        eq(domainEventsTable.eventName, 'feedSource.created'),
      ),
    ).toEqual([{ n: defaultFeedSources.length }]);
  });
});

describe('CollectFeedEntriesUseCase', () => {
  it('skips thoughtworks_radar, collects new entries and records the fetch', async () => {
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://zenn.dev/feed'
        ? ok({ body: rss([{ guid: 'https://e.test/1', title: 'one' }]), etag: '"v1"' })
        : failed('down')
    );
    const { db, ensure, collect } = setup(fetchText);
    await ensure.run();
    const result = await collect.run();
    expect(result.val).toEqual({
      sources: defaultFeedSources.length - 1,
      failed: defaultFeedSources.length - 2,
      collected: 1,
      expired: 0,
    });
    expect(fetchText).not.toHaveBeenCalledWith('https://www.thoughtworks.com/radar/archive', expect.anything());
    const [zenn] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, 'https://zenn.dev/feed'));
    expect(zenn).toMatchObject({ etag: '"v1"', lastError: null, lastFetchedAt: new Date(NOW) });
    const [mercari] = await db.select().from(feedSourcesTable).where(
      eq(feedSourcesTable.url, 'https://engineering.mercari.com/blog/feed.xml'),
    );
    expect(mercari).toMatchObject({ lastError: 'down', lastFetchedAt: new Date(NOW) });
    expect(await db.select({ title: feedEntriesTable.title }).from(feedEntriesTable)).toEqual([{ title: 'one' }]);
  });

  it('limits parallel fetches to four', async () => {
    let running = 0;
    let peak = 0;
    const fetchText = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return ok({ body: rss([]) });
    });
    const { ensure, collect } = setup(fetchText);
    await ensure.run();
    await collect.run();
    expect(fetchText).toHaveBeenCalledTimes(defaultFeedSources.length - 1);
    expect(peak).toBe(4);
  });

  it('sends validators, records 304 as fetched and keeps the stored etag', async () => {
    const bodies = [ok({ body: rss([{ guid: 'https://e.test/1', title: 'one' }]), etag: '"v1"', lastModified: 'LM' })];
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://zenn.dev/feed' ? (bodies.shift() ?? ok({ status: 304 })) : ok({ status: 304 })
    );
    const { db, ensure, collect } = setup(fetchText);
    await ensure.run();
    await collect.run();
    fetchText.mockClear();
    const second = await collect.run();
    expect(second.val).toMatchObject({ failed: 0, collected: 0 });
    expect(fetchText).toHaveBeenCalledWith(
      'https://zenn.dev/feed',
      expect.objectContaining({
        timeoutMs: 10_000,
        maxBytes: 2 * 1024 * 1024,
        maxRedirects: 3,
        headers: { 'If-None-Match': '"v1"', 'If-Modified-Since': 'LM' },
      }),
    );
    const [zenn] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, 'https://zenn.dev/feed'));
    expect(zenn).toMatchObject({ etag: '"v1"', lastModified: 'LM', lastError: null });
  });

  it('does not duplicate known guids and records a changed bookmark count', async () => {
    let body = rss([{ guid: 'https://e.test/1', title: 'one', count: 3 }, { guid: 'https://e.test/1', title: 'dup' }]);
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://b.hatena.ne.jp/hotentry/it.rss' ? ok({ body }) : ok({ body: rss([]) })
    );
    const { db, ensure, collect } = setup(fetchText);
    await ensure.run();
    await collect.run();
    body = rss([{ guid: 'https://e.test/1', title: 'one', count: 9 }, {
      guid: 'https://e.test/2',
      title: 'two',
      count: 1,
    }]);
    const second = await collect.run();
    expect(second.val).toMatchObject({ collected: 1 });
    const rows = await db.select().from(feedEntriesTable).orderBy(feedEntriesTable.guid);
    expect(rows.map((row) => [row.guid, row.hatenaBookmarkCount])).toEqual([
      ['https://e.test/1', 9],
      ['https://e.test/2', 1],
    ]);
    const events = await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable);
    expect(events.filter((event) => event.name === 'feedEntry.collected')).toHaveLength(2);
    expect(events.filter((event) => event.name === 'feedEntry.bookmarkCountUpdated')).toHaveLength(1);
  });

  it('records a parse failure without stopping other sources', async () => {
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://zenn.dev/feed'
        ? ok({ body: '<html></html>' })
        : ok({ body: rss([{ guid: `${url}#1`, title: 'x' }]) })
    );
    const { db, ensure, collect } = setup(fetchText);
    await ensure.run();
    const result = await collect.run();
    expect(result.val).toMatchObject({ failed: 1, collected: defaultFeedSources.length - 2 });
    const [zenn] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, 'https://zenn.dev/feed'));
    expect(zenn?.lastError).toContain('Unsupported feed format');
  });

  it('expires entries fetched more than 90 days ago', async () => {
    let now = Instant.orThrow(NOW - 91 * DAY);
    const db = createSerializedDb();
    const build = (current: () => Instant) => {
      const fetchText = vi.fn(async (url: string) =>
        url === 'https://zenn.dev/feed'
          ? ok({ body: rss([{ guid: 'https://e.test/old', title: 'old' }]) })
          : ok({ body: rss([]) })
      );
      return {
        ensure: EnsureDefaultFeedSourcesUseCase.create({
          allFeedSourcesResolver: createD1AllFeedSourcesResolver(db),
          feedSourceCreatedStore: createD1FeedSourceCreatedStore(db),
          now: current,
        }),
        collect: CollectFeedEntriesUseCase.create({
          feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
          feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
          feedEntriesResolverByFetchedBefore: createD1FeedEntriesResolverByFetchedBefore(db),
          feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
          feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
          feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
          feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
          feedEntryExpiredStore: createD1FeedEntryExpiredStore(db),
          feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
          safeFetcher: { fetchText },
          now: current,
        }),
      };
    };
    const { ensure, collect } = build(() => now);
    await ensure.run();
    const first = await collect.run();
    expect(first.val).toMatchObject({ collected: 1, expired: 0 });
    now = NOW;
    const second = await collect.run();
    expect(second.val).toMatchObject({ expired: 1 });
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 0 }]);
    const events = await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable);
    expect(events.filter((event) => event.name === 'feedEntry.expired')).toHaveLength(1);
  });

  it('does not collect items older than the retention period and does not recollect expired ones', async () => {
    const oldDate = new Date(NOW - 100 * DAY).toUTCString();
    const recentDate = new Date(NOW - 10 * DAY).toUTCString();
    const body = `<rss version="2.0"><channel>`
      + `<item><title>old</title><link>https://e.test/old</link><pubDate>${oldDate}</pubDate></item>`
      + `<item><title>recent</title><link>https://e.test/recent</link><pubDate>${recentDate}</pubDate></item>`
      + `</channel></rss>`;
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://zenn.dev/feed' ? ok({ body }) : ok({ body: rss([]) })
    );
    const { db, ensure, collect } = setup(fetchText);
    await ensure.run();
    const first = await collect.run();
    expect(first.val).toMatchObject({ collected: 1, expired: 0 });
    expect(await db.select({ title: feedEntriesTable.title }).from(feedEntriesTable)).toEqual([{ title: 'recent' }]);
  });

  it('expires by publishedAt and does not collect an expired entry again while the feed still lists it', async () => {
    const published = NOW - 95 * DAY;
    let now = Instant.orThrow(published + 10 * DAY);
    const body = `<rss version="2.0"><channel>`
      + `<item><title>stale</title><link>https://e.test/stale</link><pubDate>${
        new Date(published).toUTCString()
      }</pubDate></item>`
      + `</channel></rss>`;
    const fetchText = vi.fn(async (url: string) =>
      url === 'https://zenn.dev/feed' ? ok({ body }) : ok({ body: rss([]) })
    );
    const { db, ensure, collect } = setup(fetchText, () => now);
    await ensure.run();
    expect((await collect.run()).val).toMatchObject({ collected: 1, expired: 0 });
    now = NOW;
    expect((await collect.run()).val).toMatchObject({ collected: 0, expired: 1 });
    expect((await collect.run()).val).toMatchObject({ collected: 0, expired: 0 });
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 0 }]);
  });
});
