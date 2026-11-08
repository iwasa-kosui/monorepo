import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import { createD1XPostsResolverByFetchedSince } from '../feedEntry/xPostsResolverByFetchedSince.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const embedding = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  let counter = 1000;
  const addFeedSource = (kind: string, url: string, enabled = true) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, url, kind, enabled ? 1 : 0, 1_000);
    return feedSourceId;
  };
  const addEntry = (
    feedSourceId: string,
    options: { title?: string; publishedAt?: number | null; fetchedAt?: number; embedding?: Uint8Array | null } = {},
  ) => {
    const feedEntryId = uuid(++counter);
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      `https://x.com/someone/status/${counter}`,
      options.title ?? `title ${counter}`,
      'description',
      options.publishedAt === undefined ? 5_000 : options.publishedAt,
      options.fetchedAt ?? 10_000,
      options.embedding ?? null,
      options.embedding === undefined || options.embedding === null ? null : 10_000,
    );
    return feedEntryId;
  };
  const resolve = async (fetchedSince = 0, limit = 10) =>
    (await createD1XPostsResolverByFetchedSince(db).resolve({ fetchedSince: Instant.orThrow(fetchedSince), limit }))
      .val;
  return { addFeedSource, addEntry, resolve };
};

describe('XPostsResolverByFetchedSince', () => {
  it('有効な x_user の情報源の投稿を、情報源の URL から取ったユーザー名つきで新しく取得した順に返す', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const source = addFeedSource('x_user', 'https://x.com/kosui_iwasa');
    const older = addEntry(source, { title: 'older', fetchedAt: 10_000 });
    const newer = addEntry(source, { title: 'newer', fetchedAt: 20_000 });

    const resolved = await resolve();

    expect(resolved.map((post) => [post.feedEntryId, post.username, post.title])).toEqual([
      [newer, 'kosui_iwasa', 'newer'],
      [older, 'kosui_iwasa', 'older'],
    ]);
  });

  it('無効にした情報源の投稿と、x_user 以外の情報源の記事は返さない', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const kept = addEntry(addFeedSource('x_user', 'https://x.com/jack'));
    addEntry(addFeedSource('x_user', 'https://x.com/disabled', false));
    addEntry(addFeedSource('rss', 'https://feeds.example/rss'));
    addEntry(addFeedSource('hatena_hotentry', 'https://feeds.example/hatena'));

    const resolved = await resolve();

    expect(resolved.map((post) => post.feedEntryId)).toEqual([kept]);
  });

  it('取得した時刻が fetchedSince より前の投稿は返さない', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const source = addFeedSource('x_user', 'https://x.com/jack');
    const kept = addEntry(source, { fetchedAt: 10_000 });
    addEntry(source, { fetchedAt: 9_999 });

    const resolved = await resolve(10_000);

    expect(resolved.map((post) => post.feedEntryId)).toEqual([kept]);
  });

  it('投稿日時を postedAt にし、無ければ取得した時刻にする', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const source = addFeedSource('x_user', 'https://x.com/jack');
    addEntry(source, { publishedAt: 5_000, fetchedAt: 10_000 });
    addEntry(source, { publishedAt: null, fetchedAt: 9_000 });

    const resolved = await resolve();

    expect(resolved.map((post) => post.postedAt).sort()).toEqual([5_000, 9_000]);
  });

  it('埋め込み済みなら埋め込みを返し、未埋め込みや次元が合わないものは null にする', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const source = addFeedSource('x_user', 'https://x.com/jack');
    const embedded = addEntry(source, { embedding: float32ToBytes(embedding), fetchedAt: 30_000 });
    const pending = addEntry(source, { fetchedAt: 20_000 });
    const invalid = addEntry(source, { embedding: float32ToBytes(new Float32Array(3)), fetchedAt: 10_000 });

    const resolved = await resolve();

    expect(resolved.map((post) => [post.feedEntryId, post.embedding === null ? null : post.embedding.length])).toEqual([
      [embedded, EMBEDDING_DIMENSIONS],
      [pending, null],
      [invalid, null],
    ]);
  });

  it('URL からユーザー名を取れない情報源の投稿は返さない', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    addEntry(addFeedSource('x_user', 'https://x.com/not-valid-name'));

    expect(await resolve()).toEqual([]);
  });

  it('limit 件までにする', async () => {
    const { addFeedSource, addEntry, resolve } = setup();
    const source = addFeedSource('x_user', 'https://x.com/jack');
    for (let i = 0; i < 3; i += 1) addEntry(source, { fetchedAt: 10_000 + i });

    expect(await resolve(0, 2)).toHaveLength(2);
  });
});
