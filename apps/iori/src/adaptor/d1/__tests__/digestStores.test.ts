import { describe, expect, it } from 'vitest';

import { Digest } from '../../../domain/digest/digest.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestCreatedStore } from '../digest/digestCreatedStore.ts';
import { createD1DigestExpiredStore } from '../digest/digestExpiredStore.ts';
import { createD1DigestHeadersResolverByUserIdAndDigestDate } from '../digest/digestHeadersResolverByUserIdAndDigestDate.ts';
import { createD1DigestsResolverByXPostsCreatedBefore } from '../digest/digestsResolverByXPostsCreatedBefore.ts';
import { createD1DigestXPostsRemovedStore } from '../digest/digestXPostsRemovedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));

const createDigest = (
  options: { userId?: UserId; topicKey?: string; xPostsPostId?: PostId | null; createdAt?: Instant } = {},
) => {
  const created = Digest.create({
    userId: options.userId ?? UserId.generate(),
    digestDate: '2026-11-05',
    postId: PostId.generate(),
    xPostsPostId: options.xPostsPostId === undefined ? PostId.generate() : options.xPostsPostId,
    trigger: 'scheduled',
    topicKey: options.topicKey ?? 'summary',
    items: [
      {
        feedEntryId: 'e1',
        url: 'https://example.com/1',
        title: '1',
        rank: 1,
        score: null,
        summary: null,
        reasonInterestSourceId: null,
      },
      {
        feedEntryId: 'e2',
        url: 'https://example.com/2',
        title: '2',
        rank: 2,
        score: null,
        summary: null,
        reasonInterestSourceId: null,
      },
    ],
    trends: [{ kind: 'hatena', rank: 1, url: 'https://example.com/h', title: 'H', count: 1 }],
    xPostFeedEntryIds: ['x-1', 'x-2'],
  }, options.createdAt ?? now);
  if (!created.ok) throw new Error('unexpected');
  return created.val;
};

describe('digest stores', () => {
  it('同じ日の同じ topicKey の digest を2つ保存でき、それぞれの postId と xPostsPostId を読み戻せる', async () => {
    const fixture = createSqliteD1Fixture();
    const owner = createMastodonSeed(fixture).addLocalActor('kosui');
    const userId = UserId.orThrow(owner.userId);
    const first = createDigest({ userId });
    const second = createDigest({ userId, xPostsPostId: null, createdAt: Instant.orThrow(now + 1_000) });

    await createD1DigestCreatedStore(fixture.db).store(first, second);

    const headers = await createD1DigestHeadersResolverByUserIdAndDigestDate(fixture.db).resolve({
      userId,
      digestDate: '2026-11-05',
    });
    expect(headers.ok && headers.val.map((header) => [header.digestId, header.postId, header.xPostsPostId])).toEqual([
      [first.aggregateState.digestId, first.aggregateState.postId, first.aggregateState.xPostsPostId],
      [second.aggregateState.digestId, second.aggregateState.postId, null],
    ]);
    expect(fixture.sqlite.prepare('SELECT articleId FROM digests').all()).toEqual([
      { articleId: null },
      { articleId: null },
    ]);
  });

  it('削除ストアは、消す digest の深掘りだけを消し、ほかの digest の深掘りを残す', async () => {
    const fixture = createSqliteD1Fixture();
    const author = createMastodonSeed(fixture).addLocalActor('kosui');
    const { sqlite } = fixture;
    const target = createDigest({ userId: UserId.orThrow(author.userId) }).aggregateState;
    const addDigest = (digestId: string, digestDate: string) =>
      sqlite.prepare('INSERT INTO digests(digestId,userId,digestDate,postId,createdAt) VALUES (?,?,?,?,?)').run(
        digestId,
        author.userId,
        digestDate,
        PostId.generate(),
        2_000,
      );
    addDigest(target.digestId, '2026-11-05');
    addDigest('other-digest', '2026-11-04');
    const addItem = (digestItemId: string, digestId: string, rank: number) =>
      sqlite.prepare(
        'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank) VALUES (?,?,?,?,?,?)',
      ).run(digestItemId, digestId, `entry-${digestItemId}`, `https://example.com/${digestItemId}`, 'T', rank);
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

  it('xPostsRemoved を保存すると xPostsPostId だけが NULL になり、X の投稿の掃除の対象から外れる', async () => {
    const fixture = createSqliteD1Fixture();
    const owner = createMastodonSeed(fixture).addLocalActor('kosui');
    const userId = UserId.orThrow(owner.userId);
    const removing = createDigest({ userId });
    const keeping = createDigest({ userId, topicKey: 'genai' });
    await createD1DigestCreatedStore(fixture.db).store(removing, keeping);
    const resolver = createD1DigestsResolverByXPostsCreatedBefore(fixture.db);
    const createdBefore = Instant.orThrow(now + 1_000);

    const before = await resolver.resolve({ createdBefore });
    expect(before.ok && before.val.map((digest) => digest.digestId).sort()).toEqual(
      [removing.aggregateState.digestId, keeping.aggregateState.digestId].sort(),
    );
    await createD1DigestXPostsRemovedStore(fixture.db).store(
      Digest.removeXPosts(removing.aggregateState, Instant.orThrow(now + 2_000)),
    );

    const after = await resolver.resolve({ createdBefore });
    expect(after.ok && after.val.map((digest) => digest.digestId)).toEqual([keeping.aggregateState.digestId]);
    expect(fixture.sqlite.prepare('SELECT digestId, postId, xPostsPostId FROM digests ORDER BY topicKey').all())
      .toEqual(
        [
          {
            digestId: keeping.aggregateState.digestId,
            postId: keeping.aggregateState.postId,
            xPostsPostId: keeping.aggregateState.xPostsPostId,
          },
          { digestId: removing.aggregateState.digestId, postId: removing.aggregateState.postId, xPostsPostId: null },
        ],
      );
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM domain_events WHERE eventName = \'digest.xPostsRemoved\'')
        .get(),
    )
      .toEqual({ n: 1 });
  });

  it('digestsResolverByXPostsCreatedBefore は、createdBefore より前の digest だけを items と trends 付きで返す', async () => {
    const fixture = createSqliteD1Fixture();
    const owner = createMastodonSeed(fixture).addLocalActor('kosui');
    const userId = UserId.orThrow(owner.userId);
    const old = createDigest({ userId, createdAt: Instant.orThrow(1_000) });
    const recent = createDigest({ userId, topicKey: 'genai', createdAt: Instant.orThrow(9_000) });
    const withoutXPosts = createDigest({
      userId,
      topicKey: 'security',
      xPostsPostId: null,
      createdAt: Instant.orThrow(500),
    });
    await createD1DigestCreatedStore(fixture.db).store(old, recent, withoutXPosts);

    const resolved = await createD1DigestsResolverByXPostsCreatedBefore(fixture.db).resolve({
      createdBefore: Instant.orThrow(5_000),
    });

    expect(resolved).toEqual({ ok: true, val: [old.aggregateState] });
  });
});
