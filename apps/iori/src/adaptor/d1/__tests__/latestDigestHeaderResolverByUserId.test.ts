import { describe, expect, it } from 'vitest';

import { DigestId } from '../../../domain/digest/digestId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1LatestDigestHeaderResolverByUserId } from '../digest/latestDigestHeaderResolverByUserId.ts';
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
    createdAt: number,
    trigger = 'scheduled',
    topicKey = 'summary',
    legacy = false,
  ) => {
    const digestId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,postId,createdAt,trigger,topicKey) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      digestId,
      owner.userId,
      digestDate,
      legacy ? crypto.randomUUID() : null,
      legacy ? null : crypto.randomUUID(),
      createdAt,
      trigger,
      topicKey,
    );
    return DigestId.orThrow(digestId);
  };
  return { db: fixture.db, me, other, addDigest };
};

describe('createD1LatestDigestHeaderResolverByUserId', () => {
  it('digestDateBefore より前の日付で createdAt が最も新しい自分の digest の header を trigger 付きで返す', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(me, '2026-11-03', 1_000);
    const latest = addDigest(me, '2026-11-04', 3_000, 'requested');
    addDigest(me, '2026-11-02', 2_000);
    addDigest(me, '2026-11-05', 9_500);
    addDigest(other, '2026-11-04', 9_000);

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      digestDateBefore: '2026-11-05',
    });

    expect(result.ok && result.val).toMatchObject({
      digestId: latest,
      createdAt: 3_000,
      trigger: 'requested',
      topicKey: 'summary',
    });
  });

  it('digestDateBefore と同じ日付の digest は、topicKey が違っても除く', async () => {
    const { db, me, addDigest } = setup();
    const previous = addDigest(me, '2026-11-03', 1_000);
    addDigest(me, '2026-11-04', 3_000);
    addDigest(me, '2026-11-04', 4_000, 'scheduled', 'genai');

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      digestDateBefore: '2026-11-04',
    });

    expect(result.ok && result.val?.digestId).toBe(previous);
  });

  it('postId が NULL の旧 digest は、より新しくても返さない', async () => {
    const { db, me, addDigest } = setup();
    const current = addDigest(me, '2026-11-03', 1_000);
    addDigest(me, '2026-11-04', 3_000, 'scheduled', 'summary', true);

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      digestDateBefore: '2026-11-05',
    });

    expect(result.ok && result.val?.digestId).toBe(current);
  });
});
