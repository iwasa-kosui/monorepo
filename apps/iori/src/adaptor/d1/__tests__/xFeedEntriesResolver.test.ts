import { describe, expect, it } from 'vitest';

import { createD1XFeedEntriesResolver } from '../feedEntry/xFeedEntriesResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  let counter = 1000;
  const addFeedSource = (kind: string, options: { enabled?: boolean; title?: string } = {}) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(
        feedSourceId,
        kind,
        `https://feeds.example/${feedSourceId}`,
        options.title ?? kind,
        options.enabled === false ? 0 : 1,
        1_000,
      );
    return feedSourceId;
  };
  const addEntry = (
    feedSourceId: string,
    options: { text?: string; publishedAt?: number | null; fetchedAt?: number } = {},
  ) => {
    const feedEntryId = uuid(++counter);
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      `https://x.com/jack/status/${counter}`,
      `title ${counter}`,
      options.text ?? `text ${counter}`,
      options.publishedAt === undefined ? 10_000 : options.publishedAt,
      options.fetchedAt ?? 10_000,
    );
    return feedEntryId;
  };
  const resolve = async (limit = 10) => (await createD1XFeedEntriesResolver(db).resolve({ limit })).val;
  return { addFeedSource, addEntry, resolve };
};

describe('XFeedEntriesResolver', () => {
  it('x_user の情報源の投稿だけを返す', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const xUser = addFeedSource('x_user', { title: '@jack' });
    const kept = addEntry(xUser, { text: '本文' });
    addEntry(addFeedSource('rss'));
    addEntry(addFeedSource('hatena_hotentry'));

    const resolved = await resolve();

    expect(resolved).toEqual([{
      feedEntryId: kept,
      sourceTitle: '@jack',
      text: '本文',
      url: expect.stringMatching(/^https:\/\/x\.com\/jack\/status\/\d+$/),
      postedAt: 10_000,
    }]);
  });

  it('無効にした情報源の投稿は返さない', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const enabled = addFeedSource('x_user');
    const disabled = addFeedSource('x_user', { enabled: false });
    const kept = addEntry(enabled);
    addEntry(disabled);

    const resolved = await resolve();

    expect(resolved.map((entry) => entry.feedEntryId)).toEqual([kept]);
  });

  it('投稿日時の新しい順に並べ、投稿日時が無ければ取得日時で並べる', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const xUser = addFeedSource('x_user');
    const oldest = addEntry(xUser, { publishedAt: 1_000, fetchedAt: 9_000 });
    const newest = addEntry(xUser, { publishedAt: 5_000, fetchedAt: 5_100 });
    const withoutPublishedAt = addEntry(xUser, { publishedAt: null, fetchedAt: 3_000 });

    const resolved = await resolve();

    expect(resolved.map((entry) => [entry.feedEntryId, entry.postedAt])).toEqual([
      [newest, 5_000],
      [withoutPublishedAt, 3_000],
      [oldest, 1_000],
    ]);
  });

  it('上限を超える投稿は新しいものから残す', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const xUser = addFeedSource('x_user');
    addEntry(xUser, { publishedAt: 1_000 });
    const second = addEntry(xUser, { publishedAt: 2_000 });
    const third = addEntry(xUser, { publishedAt: 3_000 });

    const resolved = await resolve(2);

    expect(resolved.map((entry) => entry.feedEntryId)).toEqual([third, second]);
  });

  it('投稿が無ければ空の配列を返す', async () => {
    const { resolve } = setup();

    expect(await resolve()).toEqual([]);
  });
});
