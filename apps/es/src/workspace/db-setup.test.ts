import { describe, expect, it } from 'vitest';

import { resolveDbSetup, tablesOfSql } from './db-setup';

const source = `export const db = \`
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  pet_name TEXT NOT NULL,
  status TEXT NOT NULL
);
\`;`;

describe('DB コンソールの初期状態', () => {
  it('SQL の CREATE TABLE 文から、テーブルと列の一覧を読む', () => {
    expect(tablesOfSql('CREATE TABLE a (\n  id TEXT,\n  n INTEGER\n);')).toEqual([
      { name: 'a', columns: [{ name: 'id', type: 'TEXT' }, { name: 'n', type: 'INTEGER' }] },
    ]);
  });

  it('スナップショットのスキーマと行から、初期化の SQL を組み立てる', () => {
    const resolved = resolveDbSetup(
      {
        kind: 'schema',
        snapshot: 's',
        file: 'db.ts',
        table: 'visits',
        columns: ['id', 'pet_name', 'status'],
        rows: [['a', 'O\'Hara', 'x']],
      },
      () => source,
    );
    expect(resolved.kind).toBe('sql');
    expect(resolved.kind === 'sql' && resolved.sql).toBe(
      `CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  pet_name TEXT NOT NULL,
  status TEXT NOT NULL
);
INSERT INTO visits (id, pet_name, status) VALUES
  ('a', 'O''Hara', 'x');`,
    );
    expect(resolved.tables.map((table) => [table.name, table.columns.map((column) => column.name)])).toEqual([
      ['visits', ['id', 'pet_name', 'status']],
    ]);
  });

  it('スナップショットに CREATE TABLE 文がなければ、エラーにする', () => {
    expect(() =>
      resolveDbSetup(
        { kind: 'schema', snapshot: 's', file: 'db.ts', table: 'other', columns: [], rows: [] },
        () => source,
      )
    ).toThrow('other');
  });

  it('script の指定は、そのまま渡し、テーブルは指定されたものを使う', () => {
    const tables = [{ name: 'visits', columns: [{ name: 'id', type: 'TEXT' }] }];
    const setup = { kind: 'script', exercise: 'e', entry: 'x.ts', tables } as const;
    expect(resolveDbSetup(setup, () => '')).toEqual({ kind: 'script', setup, tables });
  });
});
