import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run('article-1', author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
  const insertDigest = (
    digestId: string,
    digestDate: string,
    userId: string = author.userId,
    topicKey: string = 'summary',
  ) =>
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(digestId, userId, digestDate, 'article-1', 2_000, null, topicKey);
  const insertItem = (digestItemId: string, digestId: string, rank: number) =>
    fixture.sqlite.prepare(
      'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(digestItemId, digestId, 'entry-1', 'https://example.com/a', 'A', rank, null, null, null, null);
  const insertTrend = (digestId: string, kind: string, rank: number) =>
    fixture.sqlite.prepare('INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)')
      .run(digestId, kind, rank, 'https://example.com/t', 'T', 3);
  return { fixture, author, insertDigest, insertItem, insertTrend };
};

describe('digests migration', () => {
  it('4 つのテーブルに insert できる', () => {
    const { fixture, author, insertDigest, insertItem, insertTrend } = setup();

    fixture.sqlite.prepare('INSERT INTO digest_subscriptions(userId,enabled,createdAt,updatedAt) VALUES (?,?,?,?)')
      .run(author.userId, 1, 1_000, 1_000);
    insertDigest('digest-1', '2026-11-05');
    insertItem('item-1', 'digest-1', 1);
    insertTrend('digest-1', 'hatena', 1);

    expect(fixture.sqlite.prepare('SELECT userId, enabled FROM digest_subscriptions').all()).toEqual([
      { userId: author.userId, enabled: 1 },
    ]);
    expect(fixture.sqlite.prepare('SELECT digestId, digestDate, pushSentAt FROM digests').all()).toEqual([
      { digestId: 'digest-1', digestDate: '2026-11-05', pushSentAt: null },
    ]);
    expect(fixture.sqlite.prepare('SELECT digestItemId, rank, score, summary FROM digest_items').all()).toEqual([
      { digestItemId: 'item-1', rank: 1, score: null, summary: null },
    ]);
    expect(fixture.sqlite.prepare('SELECT digestId, kind, rank, count FROM digest_trends').all()).toEqual([
      { digestId: 'digest-1', kind: 'hatena', rank: 1, count: 3 },
    ]);
  });

  it('同じ (userId, digestDate, topicKey) の digest は一意制約で拒否し、別の日付と別の topicKey は入れられる', () => {
    const { insertDigest } = setup();

    insertDigest('digest-1', '2026-11-05');

    expect(() => insertDigest('digest-2', '2026-11-05')).toThrow(/UNIQUE/);
    expect(() => insertDigest('digest-3', '2026-11-06')).not.toThrow();
    expect(() => insertDigest('digest-4', '2026-11-05', undefined, 'genai')).not.toThrow();
    expect(() => insertDigest('digest-5', '2026-11-05', undefined, 'genai')).toThrow(/UNIQUE/);
  });

  it('同じ (digestId, rank) の item は一意制約で拒否する', () => {
    const { insertDigest, insertItem } = setup();
    insertDigest('digest-1', '2026-11-05');
    insertItem('item-1', 'digest-1', 1);

    expect(() => insertItem('item-2', 'digest-1', 1)).toThrow(/UNIQUE/);
    expect(() => insertItem('item-3', 'digest-1', 2)).not.toThrow();
  });

  it('同じ (digestId, kind, rank) の trend は主キーで拒否し、kind が違えば入れられる', () => {
    const { insertDigest, insertTrend } = setup();
    insertDigest('digest-1', '2026-11-05');
    insertTrend('digest-1', 'hatena', 1);

    expect(() => insertTrend('digest-1', 'hatena', 1)).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insertTrend('digest-1', 'timeline_link', 1)).not.toThrow();
  });

  it('digest_items に feedbackAt を持たせ、既存の行では NULL にする', () => {
    const { fixture, insertDigest, insertItem } = setup();
    insertDigest('digest-1', '2026-11-05');
    insertItem('item-1', 'digest-1', 1);

    fixture.sqlite.prepare('UPDATE digest_items SET feedback = ?, feedbackAt = ? WHERE digestItemId = ?')
      .run('interested', 3_000, 'item-1');
    insertItem('item-2', 'digest-1', 2);

    expect(fixture.sqlite.prepare('SELECT digestItemId, feedback, feedbackAt FROM digest_items ORDER BY rank').all())
      .toEqual([
        { digestItemId: 'item-1', feedback: 'interested', feedbackAt: 3_000 },
        { digestItemId: 'item-2', feedback: null, feedbackAt: null },
      ]);
  });

  it('feedEntryId には外部キーがなく、feed_entries に無い id の item を入れられる', () => {
    const { insertDigest, insertItem } = setup();
    insertDigest('digest-1', '2026-11-05');

    expect(() => insertItem('item-1', 'digest-1', 1)).not.toThrow();
  });

  it('存在しない article の digest は外部キーで拒否する', () => {
    const { fixture, author } = setup();

    expect(() =>
      fixture.sqlite.prepare(
        'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
      ).run('digest-1', author.userId, '2026-11-05', 'missing', 1, null)
    ).toThrow(/FOREIGN KEY/);
  });
});
