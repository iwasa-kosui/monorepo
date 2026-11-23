import { describe, expect, it } from 'vitest';

import { DigestId } from '../../../domain/digest/digestId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestHeadersResolverByDigestDateBefore } from '../digest/digestHeadersResolverByDigestDateBefore.ts';
import { createD1DigestHeadersResolverByUserIdAndDigestDate } from '../digest/digestHeadersResolverByUserIdAndDigestDate.ts';
import { createD1DigestItemUrlsResolverByUserId } from '../digest/digestItemUrlsResolverByUserId.ts';
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
    topicKey: string,
    createdAt: number,
    urls: string[] = [],
    legacy = false,
  ) => {
    const digestId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,postId,createdAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(
      digestId,
      owner.userId,
      digestDate,
      legacy ? crypto.randomUUID() : null,
      legacy ? null : crypto.randomUUID(),
      createdAt,
      topicKey,
    );
    urls.forEach((url, index) => {
      fixture.sqlite.prepare(
        'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank) VALUES (?,?,?,?,?,?)',
      ).run(crypto.randomUUID(), digestId, `entry-${index}`, url, 'T', index + 1);
    });
    return DigestId.orThrow(digestId);
  };
  return { db: fixture.db, me, other, addDigest };
};

describe('createD1DigestHeadersResolverByUserIdAndDigestDate', () => {
  it('その日の自分の digest をすべて createdAt の順に返し、topicKey を付ける', async () => {
    const { db, me, other, addDigest } = setup();
    const genai = addDigest(me, '2026-11-05', 'genai', 3_000);
    const summary = addDigest(me, '2026-11-05', 'summary', 2_000);
    addDigest(me, '2026-11-04', 'summary', 1_000);
    addDigest(other, '2026-11-05', 'summary', 1_000);

    const result = await createD1DigestHeadersResolverByUserIdAndDigestDate(db).resolve({
      userId: UserId.orThrow(me.userId),
      digestDate: '2026-11-05',
    });

    expect(result.ok && result.val.map((header) => [header.digestId, header.topicKey])).toEqual([
      [summary, 'summary'],
      [genai, 'genai'],
    ]);
  });

  it('postId が NULL の旧 digest は返さない', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05', 'summary', 1_000, [], true);
    const current = addDigest(me, '2026-11-05', 'genai', 2_000);

    const result = await createD1DigestHeadersResolverByUserIdAndDigestDate(db).resolve({
      userId: UserId.orThrow(me.userId),
      digestDate: '2026-11-05',
    });

    expect(result.ok && result.val.map((header) => header.digestId)).toEqual([current]);
  });
});

describe('createD1DigestHeadersResolverByDigestDateBefore', () => {
  it('digestDateBefore より前の digest を、日付の古い順に limit 件まで返し、postId が NULL の旧 digest は返さない', async () => {
    const { db, me, other, addDigest } = setup();
    const oldest = addDigest(me, '2026-11-01', 'summary', 1_000);
    addDigest(me, '2026-11-02', 'summary', 1_000, [], true);
    const second = addDigest(other, '2026-11-03', 'summary', 1_000);
    addDigest(me, '2026-11-04', 'summary', 1_000);
    addDigest(me, '2026-11-05', 'summary', 1_000);

    const result = await createD1DigestHeadersResolverByDigestDateBefore(db).resolve({
      digestDateBefore: '2026-11-05',
      limit: 2,
    });

    expect(result.ok && result.val.map((header) => header.digestId)).toEqual([oldest, second]);
  });
});

describe('createD1DigestItemUrlsResolverByUserId', () => {
  it('自分の digest の項目の url を、topicKey と日付にかかわらずすべて返す', async () => {
    const { db, me, other, addDigest } = setup();
    addDigest(me, '2026-11-04', 'genai', 1_000, ['https://example.com/a', 'https://example.com/b']);
    addDigest(me, '2026-11-05', 'summary', 2_000, ['https://example.com/c']);
    addDigest(other, '2026-11-05', 'genai', 2_000, ['https://example.com/other']);

    const result = await createD1DigestItemUrlsResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestIds: [],
    });

    expect(result.ok && [...result.val].sort()).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });

  it('excludingDigestIds の digest の項目は除く', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-04', 'genai', 1_000, ['https://example.com/a']);
    const replacing = addDigest(me, '2026-11-05', 'genai', 2_000, ['https://example.com/b']);
    const replacingToo = addDigest(me, '2026-11-05', 'platform', 2_000, ['https://example.com/c']);

    const result = await createD1DigestItemUrlsResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestIds: [replacing, replacingToo],
    });

    expect(result).toEqual({ ok: true, val: ['https://example.com/a'] });
  });

  it('postId が NULL の旧 digest の項目は返さない', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-04', 'genai', 1_000, ['https://example.com/legacy'], true);
    addDigest(me, '2026-11-05', 'genai', 2_000, ['https://example.com/current']);

    const result = await createD1DigestItemUrlsResolverByUserId(db).resolve({
      userId: UserId.orThrow(me.userId),
      excludingDigestIds: [],
    });

    expect(result).toEqual({ ok: true, val: ['https://example.com/current'] });
  });
});
