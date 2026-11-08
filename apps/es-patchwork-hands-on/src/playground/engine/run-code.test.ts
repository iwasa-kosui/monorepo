import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { runCode } from './run-code.ts';
import { createSqlSession } from './sql-session.ts';

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

const run = (files: Record<string, string>, entry: string) => runCode({ SQL, files, entry });

describe('runCode', () => {
  it('相対 import で別のファイルを読み、console.log の出力を返す', async () => {
    const outcome = await run({
      'main.ts': 'import { double } from \'./util.ts\';\nconsole.log(double(21));',
      'util.ts': 'export const double = (value: number): number => value * 2;',
    }, 'main.ts');
    expect(outcome.error).toBeNull();
    expect(outcome.logs).toEqual([{ stream: 'stdout', text: '42' }]);
  });

  it('トップレベルの await を使える', async () => {
    const outcome = await run({ 'main.ts': 'await Promise.resolve();\nconsole.log(\'done\');' }, 'main.ts');
    expect(outcome.logs.map((line) => line.text)).toEqual(['done']);
  });

  it('DatabaseSync の行は null プロトタイプで、変更件数を返す', async () => {
    const outcome = await run({
      'main.ts': `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(':memory:');
        db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
        const result = db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
        const row = db.prepare('SELECT * FROM t').get();
        console.log(JSON.stringify(result), Object.getPrototypeOf(row) === null, db.prepare('SELECT * FROM t WHERE id = 9').get());
      `,
    }, 'main.ts');
    expect(outcome.logs[0]?.text).toBe('{"changes":1,"lastInsertRowid":1} true undefined');
  });

  it('真偽値を SQL のパラメーターに渡すと Node と同じメッセージの TypeError になる', async () => {
    const outcome = await run({
      'main.ts': `
        import { DatabaseSync } from 'node:sqlite';
        new DatabaseSync(':memory:').prepare('SELECT ?').get(true);
      `,
    }, 'main.ts');
    expect(outcome.error).toBe('TypeError: Provided value cannot be bound to SQLite parameter 1.');
  });

  it('テストの成功と失敗を件数にできる', async () => {
    const outcome = await run({
      'main.test.ts': `
        import assert from 'node:assert/strict';
        import { afterEach, beforeEach, describe, it } from 'node:test';
        const order: string[] = [];
        beforeEach(() => { order.push('before'); });
        afterEach(() => { order.push('after'); });
        describe('まとまり', () => {
          it('成功する', () => { assert.deepEqual({ a: [1] }, { a: [1] }); });
          it('失敗する', () => { assert.equal(order.length, 99, '件数が違います'); });
          it('非同期で失敗する', async () => { await assert.rejects(async () => {}); });
          it.skip('飛ばす', () => {});
        });
      `,
    }, 'main.test.ts');
    expect(outcome.error).toBeNull();
    expect(outcome.tests?.map((test) => [test.name, test.status])).toEqual([
      ['成功する', 'pass'],
      ['失敗する', 'fail'],
      ['非同期で失敗する', 'fail'],
      ['飛ばす', 'skipped'],
    ]);
    expect(outcome.tests?.[1]?.message).toBe('件数が違います\n\n3 !== 99\n');
    expect(outcome.tests?.[2]?.message).toBe('Missing expected rejection.');
  });

  it('null プロトタイプのオブジェクトと通常のオブジェクトは strict の deepEqual で等しくない', async () => {
    const outcome = await run({
      'main.test.ts': `
        import assert from 'node:assert/strict';
        import { it } from 'node:test';
        it('違う', () => { assert.deepEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 }); });
      `,
    }, 'main.test.ts');
    expect(outcome.tests?.[0]?.status).toBe('fail');
  });

  it('型の構文エラーはファイル名つきで返す', async () => {
    const outcome = await run({ 'main.ts': 'const = ;' }, 'main.ts');
    expect(outcome.error).toMatch(/^SyntaxError: main\.ts: /);
  });

  it('読み込めない import はエラーにする', async () => {
    const outcome = await run({ 'main.ts': 'import fs from \'node:fs\';\nfs.readFileSync(\'x\');' }, 'main.ts');
    expect(outcome.error).toContain('node:fs');
  });
});

describe('createSqlSession', () => {
  it('複数の文を順に実行し、行を返す文と変更件数を返す文を区別する', () => {
    const session = createSqlSession(SQL);
    expect(session.reset('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES (\'a\'), (\'b\');'))
      .toBeNull();
    const outcome = session.run('UPDATE t SET v = \'z\'; SELECT * FROM t; CREATE TABLE u (x); ');
    expect(outcome.error).toBeNull();
    expect(outcome.results.map((result) => result.kind)).toEqual(['changes', 'rows', 'done']);
    expect(outcome.results[0]).toMatchObject({ kind: 'changes', changes: 2 });
    expect(outcome.results[1]).toMatchObject({ kind: 'rows', columns: ['id', 'v'], rows: [[1, 'z'], [2, 'z']] });
  });

  it('BEGIN は次の実行まで続き、ROLLBACK で戻せる', () => {
    const session = createSqlSession(SQL);
    session.reset('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'a\');');
    session.run('BEGIN; UPDATE t SET v = \'b\';');
    expect(session.run('SELECT v FROM t').results[0]).toMatchObject({ rows: [['b']] });
    session.run('ROLLBACK');
    expect(session.run('SELECT v FROM t').results[0]).toMatchObject({ rows: [['a']] });
  });

  it('エラーは SQLite のメッセージのまま返し、その前の文の結果とその後の実行を保つ', () => {
    const session = createSqlSession(SQL);
    session.reset('CREATE TABLE t (v TEXT NOT NULL);');
    const outcome = session.run('INSERT INTO t VALUES (\'ok\'); INSERT INTO t VALUES (NULL); SELECT 1;');
    expect(outcome.results).toHaveLength(1);
    expect(outcome.error).toEqual({
      sql: 'INSERT INTO t VALUES (NULL);',
      message: 'NOT NULL constraint failed: t.v',
    });
    expect(session.run('SELECT count(*) AS n FROM t').results[0]).toMatchObject({ rows: [[1]] });
    expect(session.run('SELEC 1').error?.message).toBe('near "SELEC": syntax error');
  });

  it('最初の状態に戻す', () => {
    const session = createSqlSession(SQL);
    session.reset('CREATE TABLE t (v TEXT);');
    session.run('INSERT INTO t VALUES (\'a\');');
    session.reset('CREATE TABLE t (v TEXT);');
    expect(session.run('SELECT count(*) FROM t').results[0]).toMatchObject({ rows: [[0]] });
  });
});
