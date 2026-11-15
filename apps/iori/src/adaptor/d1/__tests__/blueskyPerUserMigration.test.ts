import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const targetIndex = migrationFiles.findIndex((name) => name.includes('bluesky_per_user'));

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const migrate = (sqlite: DatabaseSync, files: readonly string[]) => {
  for (const file of files) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
};

const setupBeforeMigration = (owner: string | undefined) => {
  if (targetIndex < 0) throw new Error('bluesky_per_user の migration が見つからない');
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  migrate(sqlite, migrationFiles.slice(0, targetIndex));
  const addUser = (userId: string, username: string) => {
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, username);
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      `actor-${userId}`,
      `https://example.com/users/${username}`,
      `https://example.com/users/${username}/inbox`,
      'local',
    );
    sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(`actor-${userId}`, userId);
  };
  if (owner !== undefined) addUser(owner, 'kosui');
  addUser('user-other', 'other');
  sqlite.exec(`
    INSERT INTO bluesky_credentials VALUES ('default','alice.bsky.social','did:plc:alice','alice.bsky.social','c','iv',1,1,1,1);
    INSERT INTO bluesky_sessions VALUES ('default','did:plc:alice','alice.bsky.social','https://pds','a','r',1);
    INSERT INTO bluesky_likes VALUES ('at://liked','at://like',1);
    INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt)
      VALUES ('feed-1','at://post','cid','did:plc:bob','bob','hi','[]',1,1,1);
    INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES ('post-other','actor-user-other','x',1,'local');
    INSERT INTO local_posts(postId,userId,visibility,createdAt) VALUES ('post-other','user-other','public',1);
    INSERT INTO bluesky_crossposts(postId,status,createdAt,updatedAt) VALUES ('post-other','sent',1,1);
    INSERT INTO notifications(notificationId,recipientUserId,type,createdAt) VALUES ('n-1','user-other','bluesky',1);
    INSERT INTO notification_bluesky(notificationId,blueskyUri,reason,authorDid,authorHandle)
      VALUES ('n-1','at://notified','like','did:plc:bob','bob');
  `);
  migrate(sqlite, [migrationFiles[targetIndex]!]);
  return sqlite;
};

describe('bluesky_per_user migration', () => {
  it('既存のアカウント単位のデータをオーナーのものとして引き継ぐ', () => {
    const sqlite = setupBeforeMigration('user-owner');

    expect(sqlite.prepare('SELECT userId, did FROM bluesky_credentials').all()).toEqual([
      { userId: 'user-owner', did: 'did:plc:alice' },
    ]);
    expect(sqlite.prepare('SELECT userId FROM bluesky_sessions').all()).toEqual([{ userId: 'user-owner' }]);
    expect(sqlite.prepare('SELECT userId, subjectUri FROM bluesky_likes').all()).toEqual([
      { userId: 'user-owner', subjectUri: 'at://liked' },
    ]);
    expect(sqlite.prepare('SELECT userId, feedItemId FROM bluesky_timeline_items').all()).toEqual([
      { userId: 'user-owner', feedItemId: 'feed-1' },
    ]);
  });

  it('クロスポストは投稿者、Bluesky の通知は通知の受け取り手に割り当てる', () => {
    const sqlite = setupBeforeMigration('user-owner');

    expect(sqlite.prepare('SELECT postId, userId FROM bluesky_crossposts').all()).toEqual([
      { postId: 'post-other', userId: 'user-other' },
    ]);
    expect(sqlite.prepare('SELECT notificationId, recipientUserId FROM notification_bluesky').all()).toEqual([
      { notificationId: 'n-1', recipientUserId: 'user-other' },
    ]);
  });

  it('オーナーがいない DB では、持ち主の分からないアカウント単位のデータを捨てて移行を終える', () => {
    const sqlite = setupBeforeMigration(undefined);

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bluesky_credentials').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bluesky_timeline_items').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bluesky_crossposts').get()).toEqual({ n: 1 });
  });
});
