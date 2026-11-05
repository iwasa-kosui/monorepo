import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const target = '0021_';

const setup = () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const run = (predicate: (name: string) => boolean) => {
    for (const file of files.filter(predicate)) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  };
  run((name) => name < target);
  sqlite.exec('PRAGMA foreign_keys=ON');
  const userId = 'user-1';
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  const insertDeepDive = (deepDiveId: string, digestItemId: string, forUserId: string = userId) =>
    sqlite.prepare(
      'INSERT INTO digest_deep_dives(deepDiveId,userId,digestItemId,articleId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    ).run(deepDiveId, forUserId, digestItemId, 'article-1', 1_000, 1_000);
  const insertTurn = (turnId: string, deepDiveId: string, turnNumber: number, instruction = '') =>
    sqlite.prepare(
      'INSERT INTO digest_deep_dive_turns(turnId,deepDiveId,turnNumber,instruction,resultMarkdown,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(turnId, deepDiveId, turnNumber, instruction, '- [A](https://example.com/a)', 1_000);
  const insertUsage = (day: string, forUserId: string = userId) =>
    sqlite.prepare('INSERT INTO digest_deep_dive_usages(userId,day,count) VALUES (?,?,?)').run(forUserId, day, 1);
  return {
    sqlite,
    insertDeepDive,
    insertTurn,
    insertUsage,
    applyTarget: () => run((name) => name >= target),
  };
};

describe('digest_deep_dives、digest_deep_dive_turns、digest_deep_dive_usages の migration', () => {
  it('適用前から有るテーブルの行はそのまま残る', () => {
    const { sqlite, applyTarget } = setup();

    applyTarget();

    expect(sqlite.prepare('SELECT userId, username FROM users').all()).toEqual([
      { userId: 'user-1', username: 'kosui' },
    ]);
  });

  it('digest_deep_dives は digestItemId の重複を拒否し、digestItemId が違えば入れられる', () => {
    const { insertDeepDive, applyTarget } = setup();
    applyTarget();

    insertDeepDive('dive-1', 'item-1');

    expect(() => insertDeepDive('dive-2', 'item-1')).toThrow(/UNIQUE/);
    expect(() => insertDeepDive('dive-3', 'item-2')).not.toThrow();
  });

  it('digest_deep_dives は存在しない userId を外部キーで拒否する', () => {
    const { insertDeepDive, applyTarget } = setup();
    applyTarget();

    expect(() => insertDeepDive('dive-1', 'item-1', 'missing-user')).toThrow(/FOREIGN KEY/);
  });

  it('digest_deep_dives は digestItemId と articleId の外部キーを持たず、digest_items に無い id を入れられる', () => {
    const { sqlite, insertDeepDive, applyTarget } = setup();
    applyTarget();

    insertDeepDive('dive-1', 'item-without-row');

    expect(sqlite.prepare('SELECT digestItemId, articleId FROM digest_deep_dives').all()).toEqual([
      { digestItemId: 'item-without-row', articleId: 'article-1' },
    ]);
  });

  it('digest_deep_dive_turns は (deepDiveId, turnNumber) の重複を拒否し、turnNumber が違えば入れられる', () => {
    const { insertDeepDive, insertTurn, applyTarget } = setup();
    applyTarget();
    insertDeepDive('dive-1', 'item-1');
    insertDeepDive('dive-2', 'item-2');

    insertTurn('turn-1', 'dive-1', 1);

    expect(() => insertTurn('turn-2', 'dive-1', 1)).toThrow(/UNIQUE/);
    expect(() => insertTurn('turn-3', 'dive-1', 2)).not.toThrow();
    expect(() => insertTurn('turn-4', 'dive-2', 1)).not.toThrow();
  });

  it('digest_deep_dive_turns は存在しない deepDiveId を外部キーで拒否し、空の instruction を受け入れる', () => {
    const { sqlite, insertDeepDive, insertTurn, applyTarget } = setup();
    applyTarget();
    insertDeepDive('dive-1', 'item-1');

    expect(() => insertTurn('turn-1', 'missing-dive', 1)).toThrow(/FOREIGN KEY/);
    expect(() => insertTurn('turn-2', 'dive-1', 1, '')).not.toThrow();
    expect(sqlite.prepare('SELECT instruction FROM digest_deep_dive_turns').all()).toEqual([{ instruction: '' }]);
  });

  it('digest_deep_dive_usages は (userId, day) を主キーにして、同じ組を拒否し、day が違えば入れられる', () => {
    const { insertUsage, applyTarget } = setup();
    applyTarget();

    insertUsage('2026-11-05');

    expect(() => insertUsage('2026-11-05')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insertUsage('2026-11-06')).not.toThrow();
  });

  it('digest_deep_dive_usages は存在しない userId を外部キーで拒否する', () => {
    const { insertUsage, applyTarget } = setup();
    applyTarget();

    expect(() => insertUsage('2026-11-05', 'missing-user')).toThrow(/FOREIGN KEY/);
  });
});
