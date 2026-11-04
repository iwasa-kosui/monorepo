import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1InterestVectorsResolverByUserId } from '../recommendation/interestVectorsResolverByUserId.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../recommendation/recommendableArticlesResolverByFetchedSince.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const vectorOf = (seed: number) => Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(i + seed));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const other = seed.addLocalActor('other');
  let counter = 1000;
  const addSource = (
    userId: string,
    options: {
      kind?: string;
      embedding?: Float32Array | Uint8Array | null;
      embeddedAt?: number | null;
      deletedAt?: number | null;
      occurredAt?: number;
      weight?: number;
    } = {},
  ) => {
    const interestSourceId = uuid(++counter);
    const embedding = options.embedding === undefined ? vectorOf(counter) : options.embedding;
    sqlite.prepare(
      'INSERT INTO interest_sources(interestSourceId,userId,kind,ref,contentHash,weight,occurredAt,embedding,embeddedAt,deletedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      interestSourceId,
      userId,
      options.kind ?? 'kosui_post',
      `ref-${counter}`,
      'a'.repeat(64),
      options.weight ?? 1,
      options.occurredAt ?? 1_000,
      embedding instanceof Float32Array ? float32ToBytes(embedding) : embedding,
      options.embeddedAt === undefined ? 2_000 : options.embeddedAt,
      options.deletedAt ?? null,
      1_000,
      1_000,
    );
    return { interestSourceId, embedding };
  };
  const addFeedSource = (kind: string) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, `https://feeds.example/${feedSourceId}`, kind, 1, 1_000);
    return feedSourceId;
  };
  const addEntry = (
    feedSourceId: string,
    options: {
      fetchedAt?: number;
      embedding?: Float32Array | Uint8Array | null;
      embeddedAt?: number | null;
      count?: number | null;
    } = {},
  ) => {
    const feedEntryId = uuid(++counter);
    const embedding = options.embedding === undefined ? vectorOf(counter) : options.embedding;
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      `https://example.com/${feedEntryId}`,
      `title ${counter}`,
      `description ${counter}`,
      options.count === undefined ? null : options.count,
      options.fetchedAt ?? 10_000,
      embedding instanceof Float32Array ? float32ToBytes(embedding) : embedding,
      options.embeddedAt === undefined ? 20_000 : options.embeddedAt,
    );
    return { feedEntryId, embedding };
  };
  const resolveVectors = async (userId: string) =>
    (await createD1InterestVectorsResolverByUserId(db).resolve(userId as UserId)).val;
  const resolveArticles = async (fetchedSince: number) =>
    (await createD1RecommendableArticlesResolverByFetchedSince(db).resolve({
      fetchedSince: Instant.orThrow(fetchedSince),
    })).val;
  return { me, other, addSource, addFeedSource, addEntry, resolveVectors, resolveArticles };
};

describe('InterestVectorsResolverByUserId', () => {
  it('本人の未削除で埋め込み済みの行を、ベクトルと occurredAt と weight つきで全 kind 返す', async () => {
    const { me, other, addSource, resolveVectors } = setup();
    const post = addSource(me.userId, { kind: 'own_post', occurredAt: 5_000, weight: 0.5 });
    const talk = addSource(me.userId, { kind: 'kosui_talk' });
    addSource(me.userId, { deletedAt: 3_000 });
    addSource(me.userId, { embedding: null, embeddedAt: null });
    addSource(other.userId);

    const resolved = await resolveVectors(me.userId);

    expect(resolved.map((vector) => vector.interestSourceId)).toEqual(
      [post.interestSourceId, talk.interestSourceId].sort(),
    );
    const found = resolved.find((vector) => vector.interestSourceId === post.interestSourceId);
    expect(found).toMatchObject({ kind: 'own_post', occurredAt: 5_000, weight: 0.5 });
    expect(found?.ref).toMatch(/^ref-/);
    expect(found?.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(found!.embedding)).toEqual(Array.from(post.embedding as Float32Array));
  });

  it('次元が 1024 でないベクトルの行は返さない', async () => {
    const { me, addSource, resolveVectors } = setup();
    const valid = addSource(me.userId);
    addSource(me.userId, { embedding: float32ToBytes(new Float32Array(8)) });

    expect((await resolveVectors(me.userId)).map((vector) => vector.interestSourceId)).toEqual([
      valid.interestSourceId,
    ]);
  });

  it('1 ページを超える件数も全件読む', async () => {
    const { me, addSource, resolveVectors } = setup();
    for (let i = 0; i < 650; i += 1) addSource(me.userId, { embedding: float32ToBytes(vectorOf(i % 5)) });

    const resolved = await resolveVectors(me.userId);

    expect(resolved).toHaveLength(650);
    expect(new Set(resolved.map((vector) => vector.interestSourceId)).size).toBe(650);
  });

  it('材料が無ければ空配列を返す', async () => {
    const { me, resolveVectors } = setup();

    expect(await resolveVectors(me.userId)).toEqual([]);
  });
});

describe('RecommendableArticlesResolverByFetchedSince', () => {
  it('since 以降に取得した埋め込み済みの rss とはてなの記事を、本文と源の kind つきで返す', async () => {
    const { addFeedSource, addEntry, resolveArticles } = setup();
    const rss = addFeedSource('rss');
    const hotentry = addFeedSource('hatena_hotentry');
    const entrylist = addFeedSource('hatena_entrylist');
    const radar = addFeedSource('thoughtworks_radar');
    const a = addEntry(rss, { fetchedAt: 10_000, count: 3 });
    const b = addEntry(hotentry, { fetchedAt: 10_001, count: 120 });
    const c = addEntry(entrylist, { fetchedAt: 10_002 });
    addEntry(radar);
    addEntry(rss, { fetchedAt: 9_999 });
    addEntry(rss, { embedding: null, embeddedAt: null });

    const resolved = await resolveArticles(10_000);

    expect(resolved.map((article) => [article.feedEntryId, article.sourceKind])).toEqual([
      [a.feedEntryId, 'rss'],
      [b.feedEntryId, 'hatena_hotentry'],
      [c.feedEntryId, 'hatena_entrylist'],
    ]);
    expect(resolved[1]).toMatchObject({
      feedSourceId: hotentry,
      url: `https://example.com/${b.feedEntryId}`,
      title: expect.stringMatching(/^title /),
      description: expect.stringMatching(/^description /),
      hatenaBookmarkCount: 120,
    });
    expect(resolved[2]?.hatenaBookmarkCount).toBeNull();
    expect(Array.from(resolved[0]!.embedding)).toEqual(Array.from(a.embedding as Float32Array));
  });

  it('次元が 1024 でないベクトルの記事は返さず、1 ページを超える件数は全件読む', async () => {
    const { addFeedSource, addEntry, resolveArticles } = setup();
    const rss = addFeedSource('rss');
    for (let i = 0; i < 620; i += 1) addEntry(rss, { embedding: float32ToBytes(vectorOf(i % 3)) });
    addEntry(rss, { embedding: float32ToBytes(new Float32Array(8)) });

    const resolved = await resolveArticles(0);

    expect(resolved).toHaveLength(620);
  });

  it('記事が無ければ空配列を返す', async () => {
    const { resolveArticles } = setup();

    expect(await resolveArticles(0)).toEqual([]);
  });
});
