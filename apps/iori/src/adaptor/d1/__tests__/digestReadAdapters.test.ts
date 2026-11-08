import { describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { DigestItemId } from '../../../domain/digest/digestItemId.ts';
import { DigestSubscription } from '../../../domain/digestSubscription/digestSubscription.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestHeadersResolverByArticleIds } from '../digest/digestHeadersResolverByArticleIds.ts';
import { createD1DigestItemFeedbackGivenStore } from '../digest/digestItemFeedbackGivenStore.ts';
import { createD1DigestResolverByArticleId } from '../digest/digestResolverByArticleId.ts';
import { createD1DigestResolverByDigestItemId } from '../digest/digestResolverByDigestItemId.ts';
import { createD1DigestResolverByUserId } from '../digest/digestResolverByUserId.ts';
import { createD1DigestResolverByUserIdAndDigestDate } from '../digest/digestResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicEntriesResolverByUserIdAndDigestDate } from '../digest/digestTopicEntriesResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../digest/digestTopicItemsResolverByUserIdAndDigestDateFrom.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestSubscriptionSavedStore } from '../digestSubscription/digestSubscriptionSavedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const other = seed.addLocalActor('other');
  const addDigest = (
    owner: { userId: string; actorId: string },
    digestDate: string,
    options: { topicKey?: string; itemCount?: number } = {},
  ) => {
    const digestId = crypto.randomUUID();
    const articleId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(articleId, owner.actorId, owner.userId, null, 'title', 'draft', 1_000, null, null);
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(digestId, owner.userId, digestDate, articleId, 2_000, null, options.topicKey ?? 'summary');
    for (const rank of [3, 1, 2].filter((candidate) => candidate <= (options.itemCount ?? 3))) {
      fixture.sqlite.prepare(
        'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        crypto.randomUUID(),
        digestId,
        `entry-${rank}`,
        `https://example.com/${rank}`,
        `T${rank}`,
        rank,
        null,
        null,
        null,
        null,
      );
    }
    for (const [kind, rank] of [['timeline_link', 1], ['hatena', 2], ['hatena', 1]] as const) {
      fixture.sqlite.prepare('INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)')
        .run(digestId, kind, rank, `https://example.com/${kind}/${rank}`, `${kind} ${rank}`, rank);
    }
    return { digestId, articleId: ArticleId.orThrow(articleId) };
  };
  const addTopic = (owner: { userId: string }, topicKey: string, name: string, sortOrder: number) =>
    fixture.sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(owner.userId, topicKey, name, `${name}の説明`, null, null, sortOrder, 1, 1, 1);
  return { fixture, db: fixture.db, me, other, addDigest, addTopic };
};

const valueOf = <T>(result: { ok: boolean; val?: T }): T => {
  if (!result.ok) throw new Error('unexpected');
  return result.val as T;
};

describe('digest の読み取り resolver', () => {
  it('ユーザーと日付で引くと items を rank 順、trends を kind と rank 順にして返す', async () => {
    const { db, me, addDigest } = setup();
    const added = addDigest(me, '2026-11-05');

    const digest = valueOf(
      await createD1DigestResolverByUserIdAndDigestDate(db).resolve({
        userId: me.userId as UserId,
        digestDate: '2026-11-05',
      }),
    );

    expect(digest).toMatchObject({ digestId: added.digestId, articleId: added.articleId, pushSentAt: null });
    expect(digest?.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(digest?.trends.map((trend) => `${trend.kind}:${trend.rank}`)).toEqual([
      'hatena:1',
      'hatena:2',
      'timeline_link:1',
    ]);
  });

  it('他人の digest や別の日の digest は返さない', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(other, '2026-11-05');
    addDigest(me, '2026-11-04');

    const digest = await createD1DigestResolverByUserIdAndDigestDate(db).resolve({
      userId: me.userId as UserId,
      digestDate: '2026-11-05',
    });

    expect(valueOf(digest)).toBeUndefined();
  });

  it('ユーザーで引くと digestDate が最も新しい digest を返す', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(me, '2026-11-03');
    const newest = addDigest(me, '2026-11-05');
    addDigest(me, '2026-11-04');
    addDigest(other, '2026-11-06');

    const digest = valueOf(await createD1DigestResolverByUserId(db).resolve(me.userId as UserId));

    expect(digest?.digestId).toBe(newest.digestId);
    expect(digest?.items).toHaveLength(3);
  });

  it('digest のないユーザーでは undefined を返す', async () => {
    const { db, me } = setup();

    expect(valueOf(await createD1DigestResolverByUserId(db).resolve(me.userId as UserId))).toBeUndefined();
  });

  it('ユーザーと日付で引くと、同じ日のトピックの digest ではなくまとめを返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05', { topicKey: 'genai' });
    const summary = addDigest(me, '2026-11-05');
    addDigest(me, '2026-11-05', { topicKey: 'security' });

    const digest = valueOf(
      await createD1DigestResolverByUserIdAndDigestDate(db).resolve({
        userId: me.userId as UserId,
        digestDate: '2026-11-05',
      }),
    );

    expect(digest).toMatchObject({ digestId: summary.digestId, topicKey: 'summary' });
  });

  it('その日にトピックの digest しかなければ、ユーザーと日付で引いても undefined を返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05', { topicKey: 'genai' });

    const digest = await createD1DigestResolverByUserIdAndDigestDate(db).resolve({
      userId: me.userId as UserId,
      digestDate: '2026-11-05',
    });

    expect(valueOf(digest)).toBeUndefined();
  });

  it('ユーザーで引くと、より新しい日のトピックの digest ではなく、まとめのある最新の日の digest を返す', async () => {
    const { db, me, addDigest } = setup();
    const summary = addDigest(me, '2026-11-04');
    addDigest(me, '2026-11-05', { topicKey: 'genai' });

    const digest = valueOf(await createD1DigestResolverByUserId(db).resolve(me.userId as UserId));

    expect(digest).toMatchObject({ digestId: summary.digestId, topicKey: 'summary' });
  });

  it('article の ID で引くと、まとめでもトピックでも、その article に結び付いた digest を items と trends 付きで返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05');
    const topic = addDigest(me, '2026-11-05', { topicKey: 'genai' });

    const digest = valueOf(await createD1DigestResolverByArticleId(db).resolve(topic.articleId));

    expect(digest).toMatchObject({ digestId: topic.digestId, topicKey: 'genai' });
    expect(digest?.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(digest?.trends).toHaveLength(3);
  });

  it('digest に結び付かない article の ID では undefined を返す', async () => {
    const { db } = setup();

    expect(valueOf(await createD1DigestResolverByArticleId(db).resolve(ArticleId.generate()))).toBeUndefined();
  });

  it('その日のトピックの一覧は、まとめを除き、項目数の多い順、同数なら sortOrder の順にして返す', async () => {
    const { db, me, other, addDigest, addTopic } = setup();
    addTopic(me, 'genai', '生成 AI', 0);
    addTopic(me, 'security', 'セキュリティ', 1);
    addTopic(me, 'design', '設計', 2);
    addDigest(me, '2026-11-05');
    const genai = addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 2 });
    const security = addDigest(me, '2026-11-05', { topicKey: 'security', itemCount: 3 });
    const design = addDigest(me, '2026-11-05', { topicKey: 'design', itemCount: 2 });
    addDigest(me, '2026-11-04', { topicKey: 'genai' });
    addDigest(other, '2026-11-05', { topicKey: 'genai' });

    const entries = valueOf(
      await createD1DigestTopicEntriesResolverByUserIdAndDigestDate(db).resolve({
        userId: me.userId as UserId,
        digestDate: '2026-11-05',
      }),
    );

    expect(entries).toEqual([
      { topicKey: 'security', name: 'セキュリティ', articleId: security.articleId, itemCount: 3 },
      { topicKey: 'genai', name: '生成 AI', articleId: genai.articleId, itemCount: 2 },
      { topicKey: 'design', name: '設計', articleId: design.articleId, itemCount: 2 },
    ]);
  });

  it('その日にトピックの digest がなければ、トピックの一覧は空の配列を返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05');

    const entries = valueOf(
      await createD1DigestTopicEntriesResolverByUserIdAndDigestDate(db).resolve({
        userId: me.userId as UserId,
        digestDate: '2026-11-05',
      }),
    );

    expect(entries).toEqual([]);
  });

  it('article の ID の集まりで引くと、該当する digest のヘッダーだけを返す', async () => {
    const { db, me, addDigest } = setup();
    const first = addDigest(me, '2026-11-04');
    addDigest(me, '2026-11-05');

    const headers = valueOf(
      await createD1DigestHeadersResolverByArticleIds(db).resolve([first.articleId, ArticleId.generate()]),
    );

    expect(headers.map((header) => header.digestId)).toEqual([first.digestId]);
  });

  it('article の ID が空なら空の配列を返す', async () => {
    const { db } = setup();

    expect(valueOf(await createD1DigestHeadersResolverByArticleIds(db).resolve([]))).toEqual([]);
  });
});

describe('createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom', () => {
  const embeddingOf = (...head: number[]) =>
    Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => head[i] ?? 0);
  const addEntry = (fixture: ReturnType<typeof setup>['fixture'], feedEntryId: string, embedding: Float32Array) => {
    fixture.sqlite.prepare(
      'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)',
    )
      .run('source', 'rss', 'https://feeds.example/rss', 'rss', 1, 1_000);
    fixture.sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      'source',
      feedEntryId,
      `https://example.com/${feedEntryId}`,
      feedEntryId,
      '',
      null,
      1_000,
      float32ToBytes(embedding),
      2_000,
    );
  };
  const resolve = async (db: ReturnType<typeof setup>['db'], userId: string, digestDateFrom: string) =>
    valueOf(
      await createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom(db).resolve({
        userId: userId as UserId,
        digestDateFrom,
      }),
    );

  it('指定日以降の summary 以外のダイジェスト項目を、新しい日付順とトピック順と rank 順で、記事の embedding つきで返す', async () => {
    const { fixture, db, me, addDigest } = setup();
    addEntry(fixture, 'entry-1', embeddingOf(1, 2));
    addDigest(me, '2026-11-04', { topicKey: 'genai', itemCount: 1 });
    addDigest(me, '2026-11-05', { topicKey: 'platform', itemCount: 2 });
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 1 });
    addDigest(me, '2026-11-05', { itemCount: 2 });
    addDigest(me, '2026-11-03', { topicKey: 'genai', itemCount: 1 });

    const items = await resolve(db, me.userId, '2026-11-04');

    expect(items.map((item) => `${item.digestDate}:${item.topicKey}:${item.rank}`)).toEqual([
      '2026-11-05:genai:1',
      '2026-11-05:platform:1',
      '2026-11-05:platform:2',
      '2026-11-04:genai:1',
    ]);
    expect(items[0]).toMatchObject({ title: 'T1', url: 'https://example.com/1', feedback: null });
    expect(items[0]!.embedding).toEqual(embeddingOf(1, 2));
  });

  it('記事が消えているか embedding の次元が違う項目は、embedding を null にする', async () => {
    const { fixture, db, me, addDigest } = setup();
    addEntry(fixture, 'entry-2', embeddingOf(1).slice(0, 8));
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 2 });

    const items = await resolve(db, me.userId, '2026-11-05');

    expect(items.map((item) => [item.rank, item.embedding])).toEqual([[1, null], [2, null]]);
  });

  it('他人のダイジェスト項目は返さない', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(other, '2026-11-05', { topicKey: 'genai' });

    expect(await resolve(db, me.userId, '2026-11-01')).toEqual([]);
  });
});

describe('digestItem の反応', () => {
  const itemIdOf = (fixture: ReturnType<typeof setup>['fixture'], digestId: string, rank: number) =>
    (fixture.sqlite.prepare('SELECT digestItemId FROM digest_items WHERE digestId = ? AND rank = ?').get(
      digestId,
      rank,
    ) as { digestItemId: string }).digestItemId as DigestItemId;

  it('digestItemId で引くと、その項目を含む digest を items と trends 付きで返す', async () => {
    const { fixture, db, me, other, addDigest } = setup();
    const mine = addDigest(me, '2026-11-05');
    addDigest(other, '2026-11-05');

    const digest = valueOf(
      await createD1DigestResolverByDigestItemId(db).resolve(itemIdOf(fixture, mine.digestId, 2)),
    );

    expect(digest).toMatchObject({ digestId: mine.digestId, userId: me.userId, articleId: mine.articleId });
    expect(digest?.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(digest?.items.every((item) => item.feedback === null && item.feedbackAt === null)).toBe(true);
    expect(digest?.trends).toHaveLength(3);
  });

  it('存在しない digestItemId では undefined を返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05');

    expect(valueOf(await createD1DigestResolverByDigestItemId(db).resolve(DigestItemId.generate()))).toBeUndefined();
  });

  it('反応ストアは feedback と feedbackAt を項目に書き、他の項目を変えず、domain event を書く', async () => {
    const { fixture, db, me, addDigest } = setup();
    const added = addDigest(me, '2026-11-05');
    const itemId = itemIdOf(fixture, added.digestId, 1);
    const digest = valueOf(await createD1DigestResolverByDigestItemId(db).resolve(itemId))!;
    const at = Instant.orThrow(5_000);
    const given = Digest.giveFeedback(digest, itemId, 'not_interested', at);
    if (!given.ok) throw new Error('unexpected');

    await createD1DigestItemFeedbackGivenStore(db).store(given.val);

    expect(
      fixture.sqlite.prepare('SELECT rank, feedback, feedbackAt FROM digest_items ORDER BY rank').all(),
    ).toEqual([
      { rank: 1, feedback: 'not_interested', feedbackAt: 5_000 },
      { rank: 2, feedback: null, feedbackAt: null },
      { rank: 3, feedback: null, feedbackAt: null },
    ]);
    const reread = valueOf(await createD1DigestResolverByDigestItemId(db).resolve(itemId));
    expect(reread?.items[0]).toMatchObject({ feedback: 'not_interested', feedbackAt: at });
    expect(fixture.sqlite.prepare('SELECT eventName FROM domain_events').all()).toEqual([
      { eventName: 'digest.itemFeedbackGiven' },
    ]);
  });

  it('取り消しは feedback と feedbackAt を NULL に戻す', async () => {
    const { fixture, db, me, addDigest } = setup();
    const added = addDigest(me, '2026-11-05');
    const itemId = itemIdOf(fixture, added.digestId, 1);
    const store = createD1DigestItemFeedbackGivenStore(db);
    const first = Digest.giveFeedback(
      valueOf(await createD1DigestResolverByDigestItemId(db).resolve(itemId))!,
      itemId,
      'interested',
      Instant.orThrow(5_000),
    );
    if (!first.ok) throw new Error('unexpected');
    await store.store(first.val);
    const second = Digest.giveFeedback(first.val.aggregateState, itemId, 'interested', Instant.orThrow(6_000));
    if (!second.ok) throw new Error('unexpected');

    await store.store(second.val);

    expect(
      fixture.sqlite.prepare('SELECT feedback, feedbackAt FROM digest_items WHERE rank = 1').get(),
    ).toEqual({ feedback: null, feedbackAt: null });
  });
});

describe('createD1DigestSubscriptionSavedStore', () => {
  it('userId で upsert し、createdAt を保って enabled と updatedAt を更新し、domain event を書く', async () => {
    const { fixture, db, me } = setup();
    const userId = me.userId as UserId;
    const store = createD1DigestSubscriptionSavedStore(db);
    const first = DigestSubscription.save({ userId, enabled: false }, undefined, Instant.orThrow(1_000));
    await store.store(first);
    const second = DigestSubscription.save({ userId, enabled: true }, first.aggregateState, Instant.orThrow(5_000));
    await store.store(second);

    const stored = valueOf(await createD1DigestSubscriptionResolverByUserId(db).resolve(userId));

    expect(stored).toEqual({ userId, enabled: true, createdAt: 1_000, updatedAt: 5_000 });
    expect(fixture.sqlite.prepare('SELECT eventName FROM domain_events').all()).toEqual([
      { eventName: 'digestSubscription.saved' },
      { eventName: 'digestSubscription.saved' },
    ]);
  });
});
