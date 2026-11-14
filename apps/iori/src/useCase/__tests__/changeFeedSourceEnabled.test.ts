import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1AllFeedSourcesResolver } from '../../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceEnabledChangedStore } from '../../adaptor/d1/feedSource/feedSourceEnabledChangedStore.ts';
import { FeedSource } from '../../domain/feedSource/feedSource.ts';
import { FeedSourceId } from '../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { ChangeFeedSourceEnabledUseCase } from '../changeFeedSourceEnabled.ts';

const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 0));
const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));

const setup = async () => {
  const { sqlite, db } = createSqliteD1Fixture();
  const change = ChangeFeedSourceEnabledUseCase.create({
    allFeedSourcesResolver: createD1AllFeedSourcesResolver(db),
    feedSourceEnabledChangedStore: createD1FeedSourceEnabledChangedStore(db),
    now: () => NOW,
  });
  const created = FeedSource.createFeedSource(
    { kind: 'rss', url: 'https://example.com/a.xml', title: 'A' },
    CREATED_AT,
  );
  const other = FeedSource.createFeedSource({ kind: 'rss', url: 'https://example.com/b.xml', title: 'B' }, CREATED_AT);
  if (!created.ok || !other.ok) throw new Error('unexpected');
  await createD1FeedSourceCreatedStore(db).store(created.val, other.val);
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'feedSource\' ORDER BY rowid')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return {
    sqlite,
    change,
    eventNames,
    feedSourceId: created.val.aggregateState.feedSourceId,
  };
};

describe('ChangeFeedSourceEnabled', () => {
  it('enabled を false にして、更新後の情報源を返す', async () => {
    const { change, feedSourceId, sqlite } = await setup();

    const result = await change.run({ feedSourceId, enabled: false });

    expect(result).toMatchObject({ ok: true, val: { feedSourceId, url: 'https://example.com/a.xml', enabled: false } });
    expect(sqlite.prepare('SELECT url, enabled FROM feed_sources ORDER BY url').all()).toEqual([
      { url: 'https://example.com/a.xml', enabled: 0 },
      { url: 'https://example.com/b.xml', enabled: 1 },
    ]);
  });

  it('feedSource.enabledChanged のイベントを残す', async () => {
    const { change, feedSourceId, eventNames } = await setup();
    const before = eventNames().length;

    await change.run({ feedSourceId, enabled: false });

    expect(eventNames().slice(before)).toEqual(['feedSource.enabledChanged']);
  });

  it('今と同じ値なら、何も書かずに情報源を返す', async () => {
    const { change, feedSourceId, eventNames } = await setup();
    const before = eventNames().length;

    const result = await change.run({ feedSourceId, enabled: true });

    expect(result).toMatchObject({ ok: true, val: { feedSourceId, enabled: true } });
    expect(eventNames()).toHaveLength(before);
  });

  it('情報源が無ければ FeedSourceNotFoundError にする', async () => {
    const { change } = await setup();
    const feedSourceId = FeedSourceId.generate();

    const result = await change.run({ feedSourceId, enabled: false });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceNotFoundError', detail: { feedSourceId } },
    });
  });
});
