import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { APPLICATION_TABLE_ORDER, EXPORT_ROW_SCOPE } from '../export-postgres.mjs';
import {
  exportedRowCounts,
  type FixtureRow,
  ids,
  insertStatement,
  outOfScopeActors,
  outOfScopePosts,
  scopeFixtureRows,
} from './exportRowScopeFixture.ts';

const schema = readFileSync(new URL('../../drizzle-d1/0000_boring_xavin.sql', import.meta.url), 'utf8');

const emptyDatabase = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
};

const insert = (db: DatabaseSync, table: string, row: FixtureRow) => {
  const { sql, values } = insertStatement(table, row, () => '?');
  db.prepare(sql).run(...(values as SQLInputValue[]));
};

const selectScoped = (db: DatabaseSync, table: string) => {
  const scope = EXPORT_ROW_SCOPE[table];
  const where = scope === null ? '' : ` WHERE ${scope}`;
  return db.prepare(`SELECT * FROM "${table}" AS row${where}`).all() as FixtureRow[];
};

const source = emptyDatabase();
const fixtureRows = scopeFixtureRows(1);
for (const table of APPLICATION_TABLE_ORDER) {
  for (const row of fixtureRows[table] ?? []) insert(source, table, row);
}
const exported = Object.fromEntries(APPLICATION_TABLE_ORDER.map(table => [table, selectScoped(source, table)]));
const column = (table: string, name: string) => exported[table]!.map(row => row[name]).sort();

describe('EXPORT_ROW_SCOPE', () => {
  it('covers exactly the application tables, and keeps the key tables whole', () => {
    expect(Object.keys(EXPORT_ROW_SCOPE).sort()).toEqual([...APPLICATION_TABLE_ORDER].sort());
    expect(EXPORT_ROW_SCOPE.keys).toBeNull();
    expect(EXPORT_ROW_SCOPE.instance_actor_keys).toBeNull();
    expect(Object.isFrozen(EXPORT_ROW_SCOPE)).toBe(true);
  });

  it('has at least one source row in every table', () => {
    for (const table of APPLICATION_TABLE_ORDER) {
      expect(source.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get(), table).not.toEqual({ count: 0 });
    }
  });

  it('keeps every foreign key closed when the scoped rows are inserted into an empty database', () => {
    const target = emptyDatabase();
    for (const table of APPLICATION_TABLE_ORDER) {
      for (const row of exported[table]!) insert(target, table, row);
    }
    expect(target.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('keeps the owner, the people around the owner and their posts, and leaves the unrelated actor behind', () => {
    expect(column('actors', 'actorId')).toEqual([ids.me, ids.a, ids.b, ids.c, ids.d, ids.e].sort());
    expect(column('remote_actors', 'actorId')).toEqual([ids.a, ids.b, ids.c, ids.d, ids.e].sort());
    expect(column('posts', 'postId')).toEqual([ids.myPost, ids.myArticlePost, ids.dPost].sort());
    expect(exported.follows).toEqual([
      { followerId: ids.me, followingId: ids.a },
      { followerId: ids.b, followingId: ids.me },
    ]);
    expect(column('likes', 'likeId')).toEqual([ids.myLikeOnD, ids.cLikeOnMine].sort());
    expect(column('local_likes', 'likeId')).toEqual([ids.myLikeOnD]);
    expect(column('remote_likes', 'likeId')).toEqual([ids.cLikeOnMine]);
    expect(column('emoji_reacts', 'actorId')).toEqual([ids.me, ids.c].sort());
    expect(column('remote_posts', 'postId')).toEqual([ids.dPost]);
    expect(column('post_images', 'postId')).toEqual([ids.myPost]);
    expect(column('link_previews', 'postId')).toEqual([ids.myPost]);
  });

  it('never selects a row of the unrelated actor or of its post', () => {
    for (const table of APPLICATION_TABLE_ORDER) {
      const text = JSON.stringify(exported[table]);
      for (const unrelated of [...outOfScopeActors, ...outOfScopePosts]) {
        expect(text, table).not.toContain(unrelated);
      }
    }
  });

  it('copies every row of the whole tables and no row of the dropped tables', () => {
    for (const table of APPLICATION_TABLE_ORDER) {
      const total = fixtureRows[table]!.length;
      expect(exported[table]!.length, table).toBe(exportedRowCounts[table] ?? total);
      if (EXPORT_ROW_SCOPE[table] === null) expect(exported[table]!.length, table).toBe(total);
    }
  });
});
