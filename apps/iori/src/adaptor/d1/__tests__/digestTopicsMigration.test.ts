import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const target = '0018_';

const setup = () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const run = (predicate: (name: string) => boolean) => {
    for (const file of files.filter(predicate)) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  };
  run((name) => name < target);
  sqlite.exec('PRAGMA foreign_keys=ON');
  const userId = 'user-1';
  const actorId = 'actor-1';
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    actorId,
    'https://example.com/users/kosui',
    'https://example.com/users/kosui/inbox',
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run('article-1', actorId, userId, null, 'title', 'draft', 1_000, null, null);
  const insertLegacyDigest = (digestId: string, digestDate: string) =>
    sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
    )
      .run(digestId, userId, digestDate, 'article-1', 2_000, null);
  const insertDigest = (digestId: string, digestDate: string, topicKey: string) =>
    sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(digestId, userId, digestDate, 'article-1', 2_000, null, topicKey);
  const insertTopic = (topicKey: string, forUserId: string = userId) =>
    sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(forUserId, topicKey, 'name', 'description', 0, 1, 1_000, 1_000);
  return { sqlite, insertLegacyDigest, insertDigest, insertTopic, applyTarget: () => run((name) => name >= target) };
};

describe('digest_topics と digests.topicKey の migration', () => {
  it('適用前から有る digests の行は topicKey が summary になり、行はそのまま残る', () => {
    const { sqlite, insertLegacyDigest, applyTarget } = setup();
    insertLegacyDigest('digest-1', '2026-11-04');
    insertLegacyDigest('digest-2', '2026-11-05');

    applyTarget();

    expect(sqlite.prepare('SELECT digestId, digestDate, topicKey FROM digests ORDER BY digestId').all()).toEqual([
      { digestId: 'digest-1', digestDate: '2026-11-04', topicKey: 'summary' },
      { digestId: 'digest-2', digestDate: '2026-11-05', topicKey: 'summary' },
    ]);
  });

  it('適用後に topicKey を省いて insert すると summary になる', () => {
    const { sqlite, insertLegacyDigest, applyTarget } = setup();
    applyTarget();

    insertLegacyDigest('digest-1', '2026-11-05');

    expect(sqlite.prepare('SELECT topicKey FROM digests').all()).toEqual([{ topicKey: 'summary' }]);
  });

  it('同じ (userId, digestDate, topicKey) の digest は拒否し、同じ日でも topicKey が違えば入れられる', () => {
    const { insertLegacyDigest, insertDigest, applyTarget } = setup();
    insertLegacyDigest('digest-1', '2026-11-05');
    applyTarget();

    expect(() => insertDigest('digest-2', '2026-11-05', 'summary')).toThrow(/UNIQUE/);
    expect(() => insertDigest('digest-3', '2026-11-05', 'genai')).not.toThrow();
    expect(() => insertDigest('digest-4', '2026-11-05', 'genai')).toThrow(/UNIQUE/);
    expect(() => insertDigest('digest-5', '2026-11-06', 'genai')).not.toThrow();
  });

  it('古い (userId, digestDate) の一意索引を消し、新しい一意索引を作る', () => {
    const { sqlite, applyTarget } = setup();
    applyTarget();

    const names = (sqlite.prepare('SELECT name FROM sqlite_master WHERE type = \'index\' AND tbl_name = \'digests\'')
      .all() as Array<{ name: string }>).map((row) => row.name);

    expect(names).not.toContain('digests_user_id_digest_date_unique');
    expect(names).toContain('digests_user_id_digest_date_topic_key_unique');
  });

  it('digest_topics は (userId, topicKey) を主キーにして、同じ組を拒否し、topicKey が違えば入れられる', () => {
    const { sqlite, insertTopic, applyTarget } = setup();
    applyTarget();

    insertTopic('genai');

    expect(() => insertTopic('genai')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insertTopic('platform')).not.toThrow();
    expect(sqlite.prepare('SELECT topicKey, embedding, embeddedAt FROM digest_topics ORDER BY topicKey').all())
      .toEqual([
        { topicKey: 'genai', embedding: null, embeddedAt: null },
        { topicKey: 'platform', embedding: null, embeddedAt: null },
      ]);
  });

  it('digest_topics は存在しない userId を外部キーで拒否する', () => {
    const { insertTopic, applyTarget } = setup();
    applyTarget();

    expect(() => insertTopic('genai', 'missing-user')).toThrow(/FOREIGN KEY/);
  });
});
