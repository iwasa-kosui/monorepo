import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1AllFeedSourcesResolver } from '../../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { defaultFeedSources } from '../../domain/feedSource/defaultFeedSources.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { AddFeedSourceUseCase } from '../addFeedSource.ts';
import { EnsureDefaultFeedSourcesUseCase } from '../ensureDefaultFeedSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  const allFeedSourcesResolver = createD1AllFeedSourcesResolver(db);
  const feedSourceCreatedStore = createD1FeedSourceCreatedStore(db);
  const add = AddFeedSourceUseCase.create({ allFeedSourcesResolver, feedSourceCreatedStore, now: () => NOW });
  const ensure = EnsureDefaultFeedSourcesUseCase.create({
    allFeedSourcesResolver,
    feedSourceCreatedStore,
    now: () => NOW,
  });
  const count = () => (sqlite.prepare('SELECT count(*) AS n FROM feed_sources').get() as { n: number }).n;
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'feedSource\' ORDER BY rowid')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return { sqlite, add, ensure, count, eventNames, enabledResolver: createD1FeedSourcesResolverByEnabled(db) };
};

describe('AddFeedSource', () => {
  it('rss の情報源を有効な状態で保存し、保存した情報源を返す', async () => {
    const { add, sqlite, eventNames } = setup();

    const result = await add.run({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ' });

    expect(result).toMatchObject({
      ok: true,
      val: {
        kind: 'rss',
        url: 'https://example.com/feed.xml',
        title: 'ブログ',
        enabled: true,
        lastFetchedAt: null,
        lastError: null,
        createdAt: NOW,
      },
    });
    expect(sqlite.prepare('SELECT kind, url, title, enabled FROM feed_sources').all()).toEqual([
      { kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ', enabled: 1 },
    ]);
    expect(eventNames()).toEqual(['feedSource.created']);
  });

  it('保存した情報源は enabled: true の resolver に出る', async () => {
    const { add, enabledResolver } = setup();

    await add.run({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ' });

    expect((await enabledResolver.resolve({ enabled: true })).val.map((source) => source.url)).toEqual([
      'https://example.com/feed.xml',
    ]);
  });

  it('同じ URL が既にあれば FeedSourceAlreadyExistsError にして、何も書かない', async () => {
    const { add, count, eventNames } = setup();
    await add.run({ kind: 'rss', url: 'https://example.com/feed.xml', title: 'ブログ' });

    const result = await add.run({ kind: 'rss', url: 'https://example.com/feed.xml', title: '別の名前' });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceAlreadyExistsError', detail: { url: 'https://example.com/feed.xml' } },
    });
    expect(count()).toBe(1);
    expect(eventNames()).toEqual(['feedSource.created']);
  });

  it('既定の情報源と同じ URL も FeedSourceAlreadyExistsError にする', async () => {
    const { add, ensure, count } = setup();
    await ensure.run();
    const zenn = defaultFeedSources.find((source) => source.kind === 'rss');
    if (zenn === undefined) throw new Error('unexpected');

    const result = await add.run({ kind: 'rss', url: zenn.url, title: zenn.title });

    expect(result).toMatchObject({ ok: false, err: { type: 'FeedSourceAlreadyExistsError' } });
    expect(count()).toBe(defaultFeedSources.length);
  });

  it.each([
    ['URL が ftp', { url: 'ftp://example.com/feed.xml', title: 'ブログ' }],
    ['URL が URL でない', { url: 'example', title: 'ブログ' }],
    ['title が空', { url: 'https://example.com/feed.xml', title: '' }],
    ['title が 101 文字', { url: 'https://example.com/feed.xml', title: 'あ'.repeat(101) }],
  ])('%s なら ParseError にして、何も書かない', async (_label, input) => {
    const { add, count } = setup();

    const result = await add.run({ kind: 'rss', ...input });

    expect(result).toMatchObject({ ok: false, err: { kind: 'ParseError' } });
    expect(count()).toBe(0);
  });
});
