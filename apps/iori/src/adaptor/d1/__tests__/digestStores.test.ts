import { describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1DigestCreatedStore } from '../digest/digestCreatedStore.ts';
import { createD1DigestExpiredStore } from '../digest/digestExpiredStore.ts';
import { createD1DigestPushSentStore } from '../digest/digestPushSentStore.ts';
import { digestItemsTable, digestsTable, digestTrendsTable, domainEventsTable } from '../schema.ts';

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

const createDigest = () => {
  const created = Digest.create({
    userId: UserId.generate(),
    digestDate: '2026-11-05',
    articleId: ArticleId.generate(),
    trigger: 'scheduled',
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

  it('削除ストアは trends、items、digest の順に消して domain event を1回の batch で書く', async () => {
    const { db, batches } = recordingDb();

    await createD1DigestExpiredStore(db).store(Digest.expire(createDigest().aggregateState, now));

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { kind: 'delete', table: digestTrendsTable },
      { kind: 'delete', table: digestItemsTable },
      { kind: 'delete', table: digestsTable },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'digest.expired' } },
    ]);
  });
});
