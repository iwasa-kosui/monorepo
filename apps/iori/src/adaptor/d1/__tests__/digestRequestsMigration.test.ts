import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run('article-1', author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
  const insertUsage = (userId: string, day: string) =>
    fixture.sqlite.prepare(
      'INSERT INTO digest_request_usages(userId,day,count,lastRequestedAt) VALUES (?,?,?,?)',
    ).run(userId, day, 1, 1_000);
  return { fixture, author, insertUsage };
};

describe('digest requests migration', () => {
  it('trigger を省いて insert した digest は scheduled になる', () => {
    const { fixture, author } = setup();

    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
    ).run('digest-1', author.userId, '2026-11-05', 'article-1', 2_000, null);

    expect(fixture.sqlite.prepare('SELECT digestId, trigger FROM digests').all()).toEqual([
      { digestId: 'digest-1', trigger: 'scheduled' },
    ]);
  });

  it('trigger を NULL にした digest は拒否する', () => {
    const { fixture, author } = setup();

    expect(() =>
      fixture.sqlite.prepare(
        'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,trigger) VALUES (?,?,?,?,?,?,?)',
      ).run('digest-1', author.userId, '2026-11-05', 'article-1', 2_000, null, null)
    ).toThrow(/NOT NULL/);
  });

  it('digest_request_usages に insert でき、同じ (userId, day) は主キーで拒否し、別の日なら入れられる', () => {
    const { fixture, author, insertUsage } = setup();

    insertUsage(author.userId, '2026-11-05');

    expect(fixture.sqlite.prepare('SELECT userId, day, count, lastRequestedAt FROM digest_request_usages').all())
      .toEqual([{ userId: author.userId, day: '2026-11-05', count: 1, lastRequestedAt: 1_000 }]);
    expect(() => insertUsage(author.userId, '2026-11-05')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insertUsage(author.userId, '2026-11-06')).not.toThrow();
  });

  it('存在しない user の行は外部キーで拒否する', () => {
    const { insertUsage } = setup();

    expect(() => insertUsage('missing', '2026-11-05')).toThrow(/FOREIGN KEY/);
  });
});
