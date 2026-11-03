import { describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { DigestSubscription } from '../../../domain/digestSubscription/digestSubscription.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestHeadersResolverByArticleIds } from '../digest/digestHeadersResolverByArticleIds.ts';
import { createD1DigestResolverByUserId } from '../digest/digestResolverByUserId.ts';
import { createD1DigestResolverByUserIdAndDigestDate } from '../digest/digestResolverByUserIdAndDigestDate.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestSubscriptionSavedStore } from '../digestSubscription/digestSubscriptionSavedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const other = seed.addLocalActor('other');
  const addDigest = (owner: { userId: string; actorId: string }, digestDate: string) => {
    const digestId = crypto.randomUUID();
    const articleId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(articleId, owner.actorId, owner.userId, null, 'title', 'draft', 1_000, null, null);
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
    ).run(digestId, owner.userId, digestDate, articleId, 2_000, null);
    for (const rank of [3, 1, 2]) {
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
  return { fixture, db: fixture.db, me, other, addDigest };
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
