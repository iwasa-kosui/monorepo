import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

const insertArticle = (
  sqlite: DatabaseSync,
  article: { articleId: string; actorId: string; userId: string; rootPostId: string | null },
) =>
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    article.articleId,
    article.actorId,
    article.userId,
    article.rootPostId,
    'title',
    'published',
    1_000,
    2_000,
    3_000,
  );

describe('0006 article_bodies migration', () => {
  it('article_bodies に insert と delete ができる', () => {
    const fixture = createSqliteD1Fixture();
    const seed = createMastodonSeed(fixture);
    const author = seed.addLocalActor('alice');
    insertArticle(fixture.sqlite, { articleId: 'article-1', ...author, rootPostId: null });

    fixture.sqlite.prepare(
      'INSERT INTO article_bodies(articleId,privateHtml,publicHtml,updatedAt) VALUES (?,?,?,?)',
    ).run('article-1', '<p>private</p>', '<p>public</p>', 4_000);
    const inserted = fixture.sqlite.prepare('SELECT * FROM article_bodies').all();
    fixture.sqlite.prepare('DELETE FROM article_bodies WHERE articleId = ?').run('article-1');
    const remaining = fixture.sqlite.prepare('SELECT * FROM article_bodies').all();

    expect(inserted).toEqual([
      { articleId: 'article-1', privateHtml: '<p>private</p>', publicHtml: '<p>public</p>', updatedAt: 4_000 },
    ]);
    expect(remaining).toEqual([]);
  });

  it('rootPostId が null の articles を insert できる', () => {
    const fixture = createSqliteD1Fixture();
    const author = createMastodonSeed(fixture).addLocalActor('alice');

    insertArticle(fixture.sqlite, { articleId: 'article-1', ...author, rootPostId: null });
    insertArticle(fixture.sqlite, { articleId: 'article-2', ...author, rootPostId: null });

    expect(fixture.sqlite.prepare('SELECT articleId, rootPostId FROM articles ORDER BY articleId').all()).toEqual([
      { articleId: 'article-1', rootPostId: null },
      { articleId: 'article-2', rootPostId: null },
    ]);
  });

  it('0005 まで適用して入れた articles の行が 0006 の適用後も全列そのまま残り、本文を紐づけられる', () => {
    const sqlite = new DatabaseSync(':memory:');
    const apply = (files: string[]) => {
      for (const file of files) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
    };
    const index0006 = migrationFiles.findIndex((name) => name.startsWith('0006_'));
    apply(migrationFiles.slice(0, index0006));
    sqlite.exec('PRAGMA foreign_keys=ON');
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run('user-1', 'alice');
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      'actor-1',
      'https://iori.test/users/alice',
      'https://iori.test/users/alice/inbox',
      'local',
    );
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      'post-1',
      'actor-1',
      'root',
      500,
      'local',
    );
    insertArticle(sqlite, { articleId: 'article-1', actorId: 'actor-1', userId: 'user-1', rootPostId: 'post-1' });
    const before = sqlite.prepare('SELECT * FROM articles').all();

    apply(migrationFiles.slice(index0006));
    const after = sqlite.prepare('SELECT * FROM articles').all();
    sqlite.prepare('INSERT INTO article_bodies(articleId,privateHtml,publicHtml,updatedAt) VALUES (?,?,?,?)').run(
      'article-1',
      '<p>private</p>',
      '<p>public</p>',
      4_000,
    );

    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    expect(sqlite.prepare('SELECT articleId FROM article_bodies').all()).toEqual([{ articleId: 'article-1' }]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
