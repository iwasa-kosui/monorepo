import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1DigestExpiredStore } from '../../adaptor/d1/digest/digestExpiredStore.ts';
import { createD1DigestHeadersResolverByDigestDateBefore } from '../../adaptor/d1/digest/digestHeadersResolverByDigestDateBefore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { ExpireDigestsUseCase } from '../expireDigests.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 0, 0));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const author = seed.addLocalActor('kosui');
  const articleId = seed.uuid();
  const { sqlite } = fixture;
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
  const addDigest = (digestDate: string) => {
    const digestId = seed.uuid();
    sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
    )
      .run(digestId, author.userId, digestDate, articleId, 1, null);
    sqlite.prepare(
      'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(`item-${digestId}`, digestId, 'entry', 'https://example.com/a', 'A', 1, null, null, null, null);
    sqlite.prepare('INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)')
      .run(digestId, 'hatena', 1, 'https://example.com/t', 'T', 1);
    return digestId;
  };
  const useCase = ExpireDigestsUseCase.create({
    digestHeadersResolverByDigestDateBefore: createD1DigestHeadersResolverByDigestDateBefore(fixture.db),
    digestExpiredStore: createD1DigestExpiredStore(fixture.db),
    now: () => NOW,
  });
  return { sqlite, addDigest, useCase };
};

describe('ExpireDigestsUseCase', () => {
  it('365 日より前の digest と、その items と trends だけを消し、article は消さない', async () => {
    const { sqlite, addDigest, useCase } = setup();
    addDigest('2025-11-03');
    addDigest('2025-11-04');
    const boundary = addDigest('2025-11-05');
    const recent = addDigest('2026-11-04');

    const result = await useCase.run();

    const remaining = [{ digestId: boundary }, { digestId: recent }];
    expect(result).toMatchObject({ ok: true, val: { expired: 2 } });
    expect(sqlite.prepare('SELECT digestId FROM digests ORDER BY digestDate').all()).toEqual(remaining);
    expect(sqlite.prepare('SELECT digestId FROM digest_items ORDER BY digestId').all()).toEqual(remaining);
    expect(sqlite.prepare('SELECT digestId FROM digest_trends ORDER BY digestId').all()).toEqual(remaining);
    expect(sqlite.prepare('SELECT count(*) AS n FROM articles').all()).toEqual([{ n: 1 }]);
    expect(sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'digest\'').all()).toEqual([
      { eventName: 'digest.expired' },
      { eventName: 'digest.expired' },
    ]);
  });

  it('消すものが無ければ何もしない', async () => {
    const { sqlite, addDigest, useCase } = setup();
    addDigest('2026-11-04');

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { expired: 0 } });
    expect(sqlite.prepare('SELECT count(*) AS n FROM digests').all()).toEqual([{ n: 1 }]);
  });

  it('1 回の取得件数より多い digest も、続けて消す', async () => {
    const { sqlite, addDigest, useCase } = setup();
    for (let day = 1; day <= 30; day += 1) addDigest(`2025-01-${String(day).padStart(2, '0')}`);
    const recent = addDigest('2026-11-04');

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { expired: 30 } });
    expect(sqlite.prepare('SELECT digestId FROM digests').all()).toEqual([{ digestId: recent }]);
  });
});
