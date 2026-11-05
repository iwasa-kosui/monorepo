import { describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1DigestCreatedStore } from '../digest/digestCreatedStore.ts';
import { createD1DigestExpiredStore } from '../digest/digestExpiredStore.ts';
import { createD1DigestPushSentStore } from '../digest/digestPushSentStore.ts';
import {
  digestDeepDivesTable,
  digestDeepDiveTurnsTable,
  digestItemsTable,
  digestsTable,
  digestTrendsTable,
  domainEventsTable,
} from '../schema.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const recordingDb = () => {
  const batches: unknown[][] = [];
  const db = {
    insert: (table: unknown) => ({ values: (values: unknown) => ({ kind: 'insert', table, values }) }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({ where: () => ({ kind: 'update', table, values }) }),
    }),
    delete: (table: unknown) => ({ where: () => ({ kind: 'delete', table }) }),
    batch: async (items: unknown[]) => batches.push(items),
  } as unknown as IoriD1Db;
  return { db, batches } as const;
};

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));

const createDigest = (topicKey = 'summary') => {
  const created = Digest.create({
    userId: UserId.generate(),
    digestDate: '2026-11-05',
    articleId: ArticleId.generate(),
    trigger: 'scheduled',
    topicKey,
    items: [
      {
        feedEntryId: 'e1',
        url: 'https://example.com/1',
        title: '1',
        rank: 1,
        score: null,
        summary: null,
        reasonInterestSourceId: null,
        feedback: null,
        feedbackAt: null,
      },
      {
        feedEntryId: 'e2',
        url: 'https://example.com/2',
        title: '2',
        rank: 2,
        score: null,
        summary: null,
        reasonInterestSourceId: null,
        feedback: null,
        feedbackAt: null,
      },
    ],
    trends: [{ kind: 'hatena', rank: 1, url: 'https://example.com/h', title: 'H', count: 1 }],
  }, now);
  if (!created.ok) throw new Error('unexpected');
  return created.val;
};

describe('digest stores', () => {
  it('作成ストアは digest、items、trends、domain event を1回の batch で書く', async () => {
    const { db, batches } = recordingDb();

    await createD1DigestCreatedStore(db).store(createDigest());

    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((statement) => (statement as { table: unknown }).table)).toEqual([
      digestsTable,
      digestItemsTable,
      digestItemsTable,
      digestTrendsTable,
      domainEventsTable,
    ]);
    expect(batches[0]![0]).toMatchObject({ values: { digestDate: '2026-11-05', pushSentAt: null } });
    expect(batches[0]![4]).toMatchObject({ values: { eventName: 'digest.created' } });
  });

  it('作成ストアは複数の digest の書き込みを、topicKey を付けて1回の batch にまとめる', async () => {
    const { db, batches } = recordingDb();

    await createD1DigestCreatedStore(db).store(createDigest('genai'), createDigest('summary'));

    expect(batches).toHaveLength(1);
    const statements = batches[0] as Array<{ table: unknown; values: Record<string, unknown> }>;
    expect(statements).toHaveLength(10);
    expect(
      statements.filter((statement) => statement.table === digestsTable).map((statement) => statement.values.topicKey),
    )
      .toEqual(['genai', 'summary']);
    expect(statements.filter((statement) => statement.table === domainEventsTable)).toHaveLength(2);
  });

  it('push 記録ストアは pushSentAt の更新と domain event を1回の batch で書く', async () => {
    const { db, batches } = recordingDb();
    const created = createDigest();

    await createD1DigestPushSentStore(db).store(Digest.recordPushSent(created.aggregateState, now));

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { kind: 'update', table: digestsTable, values: { pushSentAt: new Date(now) } },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'digest.pushSent' } },
    ]);
  });

  it('削除ストアは深掘りの往復、深掘り、trends、items、digest の順に消して domain event を1回の batch で書く', async () => {
    const { db, batches } = recordingDb();

    await createD1DigestExpiredStore(db).store(Digest.expire(createDigest().aggregateState, now));

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { kind: 'delete', table: digestDeepDiveTurnsTable },
      { kind: 'delete', table: digestDeepDivesTable },
      { kind: 'delete', table: digestTrendsTable },
      { kind: 'delete', table: digestItemsTable },
      { kind: 'delete', table: digestsTable },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'digest.expired' } },
    ]);
  });

  it('削除ストアは、消す digest の深掘りだけを消し、ほかの digest の深掘りを残す', async () => {
    const fixture = createSqliteD1Fixture();
    const author = createMastodonSeed(fixture).addLocalActor('kosui');
    const { sqlite } = fixture;
    const target = createDigest().aggregateState;
    const addDigest = (digestId: string, digestDate: string, articleId: string) => {
      sqlite.prepare(
        'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(articleId, author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
      sqlite.prepare(
        'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
      ).run(digestId, author.userId, digestDate, articleId, 2_000, null);
    };
    addDigest(target.digestId, '2026-11-05', target.articleId);
    addDigest('other-digest', '2026-11-04', 'other-article');
    const addItem = (digestItemId: string, digestId: string, rank: number) =>
      sqlite.prepare(
        'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        digestItemId,
        digestId,
        `entry-${digestItemId}`,
        `https://example.com/${digestItemId}`,
        'T',
        rank,
        null,
        null,
        null,
        null,
      );
    const addDive = (deepDiveId: string, digestItemId: string) => {
      sqlite.prepare(
        'INSERT INTO digest_deep_dives(deepDiveId,userId,digestItemId,articleId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
      ).run(deepDiveId, author.userId, digestItemId, 'a', 3_000, 3_000);
      sqlite.prepare(
        'INSERT INTO digest_deep_dive_turns(turnId,deepDiveId,turnNumber,instruction,resultMarkdown,createdAt) VALUES (?,?,?,?,?,?)',
      ).run(`turn-${deepDiveId}`, deepDiveId, 1, '', '- A', 3_000);
    };
    addItem('item-target', target.digestId, 1);
    addItem('item-other', 'other-digest', 1);
    addDive('dive-target', 'item-target');
    addDive('dive-other', 'item-other');

    await createD1DigestExpiredStore(fixture.db).store(Digest.expire(target, now));

    expect(sqlite.prepare('SELECT deepDiveId FROM digest_deep_dives').all()).toEqual([{ deepDiveId: 'dive-other' }]);
    expect(sqlite.prepare('SELECT deepDiveId FROM digest_deep_dive_turns').all()).toEqual([
      { deepDiveId: 'dive-other' },
    ]);
    expect(sqlite.prepare('SELECT digestItemId FROM digest_items').all()).toEqual([{ digestItemId: 'item-other' }]);
  });
});
