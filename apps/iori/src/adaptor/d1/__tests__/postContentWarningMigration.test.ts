import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const migrationFile = migrationFiles.find((name) => name.includes('post_content_warning'));

describe('posts の summary と sensitive の migration', () => {
  it('既存の行は summary が NULL、sensitive が 0 になる', () => {
    if (migrationFile === undefined) throw new Error('post_content_warning の migration が見つからない');
    const sqlite = new DatabaseSync(':memory:');
    for (const file of migrationFiles.filter((name) => name < migrationFile)) {
      sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
    }
    sqlite.exec(
      'INSERT INTO actors(actorId,type,uri,inboxUrl) VALUES (\'actor-1\',\'remote\',\'https://remote.example/users/alice\',\'https://remote.example/inbox\')',
    );
    sqlite.exec(
      'INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (\'post-1\',\'actor-1\',\'hi\',1000,\'remote\')',
    );

    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));

    expect(sqlite.prepare('SELECT summary, sensitive FROM posts WHERE postId = ?').get('post-1')).toEqual({
      summary: null,
      sensitive: 0,
    });
    sqlite.close();
  });
});
