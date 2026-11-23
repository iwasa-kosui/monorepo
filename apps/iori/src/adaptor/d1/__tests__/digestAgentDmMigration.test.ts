import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const targetIndex = migrationFiles.findIndex((name) => name.includes('digest_agent_dm'));

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const migrate = (sqlite: DatabaseSync, files: readonly string[]) => {
  for (const file of files) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
};

const setupBeforeMigration = () => {
  if (targetIndex < 0) throw new Error('digest_agent_dm の migration が見つからない');
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  migrate(sqlite, migrationFiles.slice(0, targetIndex));
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run('user-1', 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    'actor-1',
    'https://example.com/users/kosui',
    'https://example.com/users/kosui/inbox',
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run('actor-1', 'user-1');
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run('article-1', 'actor-1', 'user-1', null, 'title', 'draft', 1_000, null, null);
  sqlite.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,trigger,topicKey) VALUES (?,?,?,?,?,?,?,?)',
  ).run('digest-1', 'user-1', '2026-11-05', 'article-1', 2_000, 2_500, 'requested', 'genai');
  sqlite.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,feedback) VALUES (?,?,?,?,?,?,?)',
  ).run('item-1', 'digest-1', 'entry-1', 'https://example.com/a', 'A', 1, 'interested');
  sqlite.prepare('INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)')
    .run('digest-1', 'hatena', 1, 'https://example.com/t', 'T', 3);
  sqlite.prepare('INSERT INTO digest_subscriptions(userId,enabled,createdAt,updatedAt) VALUES (?,?,?,?)')
    .run('user-1', 0, 1_000, 1_000);
  sqlite.exec('BEGIN');
  migrate(sqlite, [migrationFiles[targetIndex]!]);
  sqlite.exec('COMMIT');
  return sqlite;
};

describe('digest_agent_dm migration', () => {
  it('既存の digest と子の行を、postId と xPostsPostId を NULL にして残す', () => {
    const sqlite = setupBeforeMigration();

    expect(sqlite.prepare('SELECT * FROM digests').all()).toEqual([
      {
        digestId: 'digest-1',
        userId: 'user-1',
        digestDate: '2026-11-05',
        articleId: 'article-1',
        postId: null,
        xPostsPostId: null,
        createdAt: 2_000,
        pushSentAt: 2_500,
        trigger: 'requested',
        topicKey: 'genai',
      },
    ]);
    expect(sqlite.prepare('SELECT digestItemId, digestId, feedback FROM digest_items').all()).toEqual([
      { digestItemId: 'item-1', digestId: 'digest-1', feedback: 'interested' },
    ]);
    expect(sqlite.prepare('SELECT digestId FROM digest_trends').all()).toEqual([{ digestId: 'digest-1' }]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('旧 digest が指す記事の行を DELETE でき、同じ日の同じ topicKey の digest を追加できる', () => {
    const sqlite = setupBeforeMigration();

    sqlite.prepare('DELETE FROM articles WHERE articleId = ?').run('article-1');
    sqlite.prepare('INSERT INTO digests(digestId,userId,digestDate,postId,createdAt,topicKey) VALUES (?,?,?,?,?,?)')
      .run('digest-2', 'user-1', '2026-11-05', 'post-1', 3_000, 'genai');

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM articles').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM digests').get()).toEqual({ n: 2 });
  });

  it('digest_subscriptions の既存の行をすべて enabled にし、updatedAt を現在時刻（ミリ秒）にする', () => {
    const before = Date.now();
    const sqlite = setupBeforeMigration();
    const after = Date.now();

    const [row] = sqlite.prepare('SELECT userId, enabled, createdAt, updatedAt FROM digest_subscriptions')
      .all() as Array<
        { userId: string; enabled: number; createdAt: number; updatedAt: number }
      >;

    expect(row).toMatchObject({ userId: 'user-1', enabled: 1, createdAt: 1_000 });
    expect(row!.updatedAt).toBeGreaterThanOrEqual(before - 1);
    expect(row!.updatedAt).toBeLessThanOrEqual(after + 1);
  });
});
