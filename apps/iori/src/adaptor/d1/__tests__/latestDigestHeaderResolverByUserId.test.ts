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
  ) => {
    const digestId = crypto.randomUUID();
    const articleId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(articleId, owner.actorId, owner.userId, null, 'title', 'draft', 1_000, null, null);
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,trigger) VALUES (?,?,?,?,?,?,?)',
    ).run(digestId, owner.userId, digestDate, articleId, createdAt, null, trigger);
    return DigestId.orThrow(digestId);
  };
  return { db: fixture.db, me, other, addDigest };
};

describe('createD1LatestDigestHeaderResolverByUserId', () => {
  it('createdAt が最も新しい自分の digest の header を trigger 付きで返す', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(me, '2026-11-03', 1_000);
    const latest = addDigest(me, '2026-11-04', 3_000, 'requested');
    addDigest(me, '2026-11-02', 2_000);
    addDigest(other, '2026-11-04', 9_000);

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestId: undefined,
    });

    expect(result.ok && result.val).toMatchObject({ digestId: latest, createdAt: 3_000, trigger: 'requested' });
  });

  it('excludingDigestId の digest を除いて、次に新しいものを返す', async () => {
    const { db, me, addDigest } = setup();
    const previous = addDigest(me, '2026-11-03', 1_000);
    const excluded = addDigest(me, '2026-11-04', 3_000);

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestId: excluded,
    });

    expect(result.ok && result.val?.digestId).toBe(previous);
  });

  it('除いた後に何も残らなければ undefined を返す', async () => {
    const { db, me, addDigest } = setup();
    const only = addDigest(me, '2026-11-04', 3_000);

    const result = await createD1LatestDigestHeaderResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestId: only,
    });

    expect(result).toEqual({ ok: true, val: undefined });
  });
});
