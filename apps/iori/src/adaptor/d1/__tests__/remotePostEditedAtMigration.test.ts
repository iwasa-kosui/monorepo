import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const migrationFile = migrationFiles.find((name) => name.includes('remote_post_edited_at'));

describe('remote_posts の editedAt の migration', () => {
  it('既存の行は editedAt が NULL になる', () => {
    if (migrationFile === undefined) throw new Error('remote_post_edited_at の migration が見つからない');
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
    sqlite.exec(
      'INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (\'post-1\',\'https://remote.example/notes/1\',NULL,NULL)',
    );

    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));

    expect(sqlite.prepare('SELECT editedAt FROM remote_posts WHERE postId = ?').get('post-1')).toEqual({
      editedAt: null,
    });
    sqlite.close();
  });
});
