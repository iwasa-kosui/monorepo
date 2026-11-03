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
import { createD1AllFeedSourcesResolver } from '../../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceFetchedStore } from '../../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { domainEventsTable, feedEntriesTable, feedSourcesTable } from '../../adaptor/d1/schema.ts';
import type { SafeFetcher, SafeFetchError, SafeFetchResult } from '../../adaptor/http/safeFetch.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { CollectFeedEntriesUseCase } from '../collectFeedEntries.ts';
import { DetectRadarVolumeUseCase } from '../detectRadarVolume.ts';
import { EnsureDefaultFeedSourcesUseCase } from '../ensureDefaultFeedSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 5, 1));
const DAY = 24 * 60 * 60 * 1000;
const RADAR_URL = 'https://www.thoughtworks.com/radar/archive';
const PDF_DIR = '/content/dam/thoughtworks/documents/radar';

const ok = (value: Partial<SafeFetchResult>): Result<SafeFetchResult, SafeFetchError> =>
  Result.ok({ status: 200, etag: null, lastModified: null, finalUrl: RADAR_URL, ...value });

const failed = (message: string): Result<SafeFetchResult, SafeFetchError> =>
  Result.err({ type: 'SafeFetchError', reason: 'network', message });

const html = (...links: ReadonlyArray<string>) =>
  `<html><body>${links.map((link) => `<a href="${link}">x</a>`).join('')}</body></html>`;

const vol34 = html(
  `${PDF_DIR}/2025/11/tr_technology_radar_vol_33_en.pdf`,
  `${PDF_DIR}/2026/04/tr_technology_radar_vol_34_en.pdf`,
);

const setup = (fetchText: SafeFetcher['fetchText'], now: () => Instant = () => NOW) => {
  const db = createD1Db(createSqliteD1Fixture().binding);
  const ensure = EnsureDefaultFeedSourcesUseCase.create({
    allFeedSourcesResolver: createD1AllFeedSourcesResolver(db),
    feedSourceCreatedStore: createD1FeedSourceCreatedStore(db),
    now,
  });
  const detect = DetectRadarVolumeUseCase.create({
    feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
    feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
    feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
    feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
    feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
    safeFetcher: { fetchText },
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
    safeFetcher: { fetchText: async () => ok({ body: '<rss version="2.0"><channel></channel></rss>' }) },
    now,
  });
  return { db, ensure, detect, collect };
};

const radarSource = async (db: ReturnType<typeof setup>['db']) => {
  const [source] = await db.select().from(feedSourcesTable).where(eq(feedSourcesTable.url, RADAR_URL));
  return source!;
};

describe('DetectRadarVolumeUseCase', () => {
  it('collects the latest volume as one entry and records the fetch', async () => {
    const fetchText = vi.fn(async () => ok({ body: vol34, etag: '"r1"' }));
    const { db, ensure, detect } = setup(fetchText);
    await ensure.run();
    expect((await detect.run()).val).toEqual({ sources: 1, failed: 0, collected: 1 });
    expect(fetchText).toHaveBeenCalledWith(
      RADAR_URL,
      { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3, headers: {} },
    );
    const [entry] = await db.select().from(feedEntriesTable);
    expect(entry).toMatchObject({
      guid: 'thoughtworks-radar-vol-34',
      url: `https://www.thoughtworks.com${PDF_DIR}/2026/04/tr_technology_radar_vol_34_en.pdf`,
      title: 'Thoughtworks Technology Radar Vol 34',
      description: '',
      publishedAt: new Date(Date.UTC(2026, 3, 1)),
      hatenaBookmarkCount: null,
      fetchedAt: new Date(NOW),
    });
    expect(await radarSource(db)).toMatchObject({ etag: '"r1"', lastError: null, lastFetchedAt: new Date(NOW) });
    const events = await db.select({ name: domainEventsTable.eventName }).from(domainEventsTable);
    expect(events.filter((event) => event.name === 'feedEntry.collected')).toHaveLength(1);
  });

  it('does not collect the same volume again', async () => {
    const { db, ensure, detect } = setup(vi.fn(async () => ok({ body: vol34 })));
    await ensure.run();
    await detect.run();
    expect((await detect.run()).val).toEqual({ sources: 1, failed: 0, collected: 0 });
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 1 }]);
  });

  it('collects a newer volume next to the stored one', async () => {
    let body = vol34;
    const { db, ensure, detect } = setup(vi.fn(async () => ok({ body })));
    await ensure.run();
    await detect.run();
    body = html(`${PDF_DIR}/2026/10/tr_technology_radar_vol_35_en.pdf`);
    expect((await detect.run()).val).toMatchObject({ collected: 1 });
    const rows = await db.select({ guid: feedEntriesTable.guid }).from(feedEntriesTable).orderBy(feedEntriesTable.guid);
    expect(rows).toEqual([{ guid: 'thoughtworks-radar-vol-34' }, { guid: 'thoughtworks-radar-vol-35' }]);
  });

  it('sends validators and does nothing on 304', async () => {
    const responses = [ok({ body: vol34, etag: '"r1"', lastModified: 'LM' })];
    const fetchText = vi.fn(async () => responses.shift() ?? ok({ status: 304 }));
    const { db, ensure, detect } = setup(fetchText);
    await ensure.run();
    await detect.run();
    fetchText.mockClear();
    expect((await detect.run()).val).toEqual({ sources: 1, failed: 0, collected: 0 });
    expect(fetchText).toHaveBeenCalledWith(
      RADAR_URL,
      expect.objectContaining({ headers: { 'If-None-Match': '"r1"', 'If-Modified-Since': 'LM' } }),
    );
    expect(await radarSource(db)).toMatchObject({ etag: '"r1"', lastModified: 'LM', lastError: null });
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 1 }]);
  });

  it('records a failure with a structure-change reason when no volume is found', async () => {
    const { db, ensure, detect } = setup(vi.fn(async () => ok({ body: '<html></html>' })));
    await ensure.run();
    expect((await detect.run()).val).toEqual({ sources: 1, failed: 1, collected: 0 });
    expect((await radarSource(db)).lastError).toContain('page structure may have changed');
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 0 }]);
  });

  it('records a fetch failure', async () => {
    const { db, ensure, detect } = setup(vi.fn(async () => failed('down')));
    await ensure.run();
    expect((await detect.run()).val).toEqual({ sources: 1, failed: 1, collected: 0 });
    expect(await radarSource(db)).toMatchObject({ lastError: 'down', lastFetchedAt: new Date(NOW) });
  });

  it('fetches only enabled thoughtworks_radar sources', async () => {
    const fetchText = vi.fn(async () => ok({ body: vol34 }));
    const { db, ensure, detect } = setup(fetchText);
    await ensure.run();
    await db.update(feedSourcesTable).set({ enabled: false }).where(eq(feedSourcesTable.url, RADAR_URL));
    expect((await detect.run()).val).toEqual({ sources: 0, failed: 0, collected: 0 });
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('keeps a radar entry past the retention period', async () => {
    let now = NOW;
    const { db, ensure, detect, collect } = setup(vi.fn(async () => ok({ body: vol34 })), () => now);
    await ensure.run();
    await detect.run();
    now = Instant.orThrow(NOW + 200 * DAY);
    expect((await collect.run()).val).toMatchObject({ expired: 0 });
    expect((await detect.run()).val).toMatchObject({ collected: 0 });
    expect(await db.select({ n: count() }).from(feedEntriesTable)).toEqual([{ n: 1 }]);
  });
});
