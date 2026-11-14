import { describe, expect, it } from 'vitest';

import { FeedSource } from '../../../domain/feedSource/feedSource.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1AllFeedSourcesResolver } from '../feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceEnabledChangedStore } from '../feedSource/feedSourceEnabledChangedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../feedSource/feedSourcesResolverByEnabled.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 0));
const CHANGED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 6));

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  const createSource = (url: string) => {
    const created = FeedSource.createFeedSource({ kind: 'rss', url, title: url }, CREATED_AT);
    if (!created.ok) throw new Error('unexpected');
    return created.val;
  };
  const enabledRows = () =>
    sqlite.prepare('SELECT url, enabled FROM feed_sources ORDER BY url').all() as Array<
      { url: string; enabled: number }
    >;
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'feedSource\' ORDER BY rowid')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return {
    createSource,
    enabledRows,
    eventNames,
    createdStore: createD1FeedSourceCreatedStore(db),
    enabledChangedStore: createD1FeedSourceEnabledChangedStore(db),
    allResolver: createD1AllFeedSourcesResolver(db),
    enabledResolver: createD1FeedSourcesResolverByEnabled(db),
  };
};

describe('createD1FeedSourceEnabledChangedStore', () => {
  it('対象の情報源だけ enabled を変え、feedSource.enabledChanged を domain_events に残す', async () => {
    const { createSource, createdStore, enabledChangedStore, enabledRows, eventNames } = setup();
    const target = createSource('https://example.com/a.xml');
    const other = createSource('https://example.com/b.xml');
    await createdStore.store(target, other);

    await enabledChangedStore.store(FeedSource.setEnabled(target.aggregateState, false, CHANGED_AT));

    expect(enabledRows()).toEqual([
      { url: 'https://example.com/a.xml', enabled: 0 },
      { url: 'https://example.com/b.xml', enabled: 1 },
    ]);
    expect(eventNames()).toEqual(['feedSource.created', 'feedSource.created', 'feedSource.enabledChanged']);
  });

  it('無効にした情報源は enabled: true の resolver に出ず、enabled: false の resolver と全件の resolver に出る', async () => {
    const { createSource, createdStore, enabledChangedStore, enabledResolver, allResolver } = setup();
    const target = createSource('https://example.com/a.xml');
    const other = createSource('https://example.com/b.xml');
    await createdStore.store(target, other);

    await enabledChangedStore.store(FeedSource.setEnabled(target.aggregateState, false, CHANGED_AT));

    expect((await enabledResolver.resolve({ enabled: true })).val.map((source) => source.url)).toEqual([
      'https://example.com/b.xml',
    ]);
    expect((await enabledResolver.resolve({ enabled: false })).val.map((source) => source.url)).toEqual([
      'https://example.com/a.xml',
    ]);
    expect((await allResolver.resolve()).val).toHaveLength(2);
  });
});
