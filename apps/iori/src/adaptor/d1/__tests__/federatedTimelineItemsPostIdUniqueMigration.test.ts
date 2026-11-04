import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const target = '0016_';

const setup = () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const run = (predicate: (name: string) => boolean) => {
    for (const file of files.filter(predicate)) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  };
  run((name) => name < target);
  sqlite.exec('PRAGMA foreign_keys=ON');
  const actorId = 'actor-1';
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    actorId,
    'https://remote.example/users/a',
    'https://remote.example/users/a/inbox',
    'remote',
  );
  for (const postId of ['post-1', 'post-2']) {
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      postId,
      actorId,
      'c',
      1,
      'remote',
    );
  }
  for (const relayId of ['relay-1', 'relay-2']) {
    sqlite.prepare('INSERT INTO relays(relayId,inboxUrl,actorUri,status,createdAt) VALUES (?,?,?,?,?)').run(
      relayId,
      `https://relay.example/${relayId}/inbox`,
      `https://relay.example/${relayId}/actor`,
      'accepted',
      1,
    );
  }
  const insertItem = (id: string, postId: string, receivedAt: number, relayId = 'relay-1') =>
    sqlite.prepare(
      'INSERT INTO federated_timeline_items(federatedTimelineItemId,postId,relayId,receivedAt) VALUES (?,?,?,?)',
    )
      .run(id, postId, relayId, receivedAt);
  const remainingIds = () =>
    (sqlite.prepare('SELECT federatedTimelineItemId AS id FROM federated_timeline_items ORDER BY id').all() as Array<
      { id: string }
    >).map((row) => row.id);
  return { sqlite, insertItem, remainingIds, applyTarget: () => run((name) => name.startsWith(target)) };
};

describe('federated_timeline_items の post_id と relay_id の一意索引の migration', () => {
  it('post_id と relay_id が重複する行は received_at が最も古い1件だけ残し、同じ時刻なら主キーが小さい方を残す', () => {
    const { insertItem, remainingIds, applyTarget } = setup();
    insertItem('a-new', 'post-1', 3_000);
    insertItem('a-old', 'post-1', 1_000);
    insertItem('a-mid', 'post-1', 2_000);
    insertItem('b-2', 'post-2', 5_000);
    insertItem('b-1', 'post-2', 5_000);

    applyTarget();

    expect(remainingIds()).toEqual(['a-old', 'b-1']);
  });

  it('同じ post_id でも relay_id が違う行は、どちらも残す', () => {
    const { insertItem, remainingIds, applyTarget } = setup();
    insertItem('a-1', 'post-1', 1_000, 'relay-1');
    insertItem('a-2', 'post-1', 2_000, 'relay-2');
    insertItem('a-3', 'post-1', 3_000, 'relay-2');

    applyTarget();

    expect(remainingIds()).toEqual(['a-1', 'a-2']);
  });

  it('適用後は、同じ post_id と relay_id の項目を insert できず、relay_id が違えば insert できる', () => {
    const { insertItem, remainingIds, applyTarget } = setup();
    insertItem('a-1', 'post-1', 1_000);

    applyTarget();

    expect(() => insertItem('a-2', 'post-1', 2_000)).toThrow(/UNIQUE/);
    insertItem('a-3', 'post-1', 2_000, 'relay-2');
    expect(remainingIds()).toEqual(['a-1', 'a-3']);
  });

  it('重複がなければ行をそのまま残す', () => {
    const { insertItem, remainingIds, applyTarget } = setup();
    insertItem('a-1', 'post-1', 1_000);
    insertItem('b-1', 'post-2', 1_000);

    applyTarget();

    expect(remainingIds()).toEqual(['a-1', 'b-1']);
  });
});
