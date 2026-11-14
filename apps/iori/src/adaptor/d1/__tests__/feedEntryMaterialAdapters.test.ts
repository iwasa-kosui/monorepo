import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1RadarFeedEntriesResolverByFetchedSince } from '../feedEntry/radarFeedEntriesResolverByFetchedSince.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  let counter = 1000;
  const addFeedSource = (kind: string, enabled = true) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, `https://feeds.example/${feedSourceId}`, kind, enabled ? 1 : 0, 1_000);
    return feedSourceId;
  };
  const addEntry = (feedSourceId: string, options: { url?: string; count?: number | null } = {}) => {
    const feedEntryId = uuid(++counter);
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      options.url ?? `https://example.com/${feedEntryId}`,
      `title ${counter}`,
      `description ${counter}`,
      options.count ?? null,
      10_000,
      10_000,
    );
    return feedEntryId;
  };
  const resolveTrends = async () =>
    (await createD1HatenaTrendsResolverByFetchedSince(db).resolve({
      fetchedSince: Instant.orThrow(0),
      limit: 10,
    })).val;
  const resolveRadar = async () =>
    (await createD1RadarFeedEntriesResolverByFetchedSince(db).resolve({
      fetchedSince: Instant.orThrow(0),
      limit: 10,
    })).val;
  return { addFeedSource, addEntry, resolveTrends, resolveRadar };
};

describe('HatenaTrendsResolverByFetchedSince', () => {
  it('有効なはてなの情報源の記事を、ブックマーク数の多い順に返す', async () => {
    const { addFeedSource, addEntry, resolveTrends } = setup();
    const hotentry = addFeedSource('hatena_hotentry');
    addEntry(hotentry, { url: 'https://example.com/a', count: 10 });
    addEntry(hotentry, { url: 'https://example.com/b', count: 30 });

    const resolved = await resolveTrends();

    expect(resolved.map((trend) => [trend.url, trend.count])).toEqual([
      ['https://example.com/b', 30],
      ['https://example.com/a', 10],
    ]);
  });

  it('無効にした情報源の記事は返さない', async () => {
    const { addFeedSource, addEntry, resolveTrends } = setup();
    const enabled = addFeedSource('hatena_hotentry');
    const disabled = addFeedSource('hatena_entrylist', false);
    addEntry(enabled, { url: 'https://example.com/kept', count: 10 });
    addEntry(disabled, { url: 'https://example.com/dropped', count: 500 });

    const resolved = await resolveTrends();

    expect(resolved.map((trend) => trend.url)).toEqual(['https://example.com/kept']);
  });
});

describe('HatenaTrendsResolverByFetchedSince の x_user', () => {
  it('x_user の情報源の記事は、ブックマーク数があっても返さない', async () => {
    const { addFeedSource, addEntry, resolveTrends } = setup();
    const hotentry = addFeedSource('hatena_hotentry');
    const xUser = addFeedSource('x_user');
    addEntry(hotentry, { url: 'https://example.com/kept', count: 10 });
    addEntry(xUser, { url: 'https://x.com/jack/status/1', count: 500 });

    const resolved = await resolveTrends();

    expect(resolved.map((trend) => trend.url)).toEqual(['https://example.com/kept']);
  });
});

describe('RadarFeedEntriesResolverByFetchedSince', () => {
  it('有効な thoughtworks_radar の記事を返す', async () => {
    const { addFeedSource, addEntry, resolveRadar } = setup();
    const radar = addFeedSource('thoughtworks_radar');
    const rss = addFeedSource('rss');
    const kept = addEntry(radar);
    addEntry(rss);

    const resolved = await resolveRadar();

    expect(resolved.map((entry) => entry.feedEntryId)).toEqual([kept]);
  });

  it('無効にした情報源の記事は返さない', async () => {
    const { addFeedSource, addEntry, resolveRadar } = setup();
    const disabled = addFeedSource('thoughtworks_radar', false);
    addEntry(disabled);

    expect(await resolveRadar()).toEqual([]);
  });
});
