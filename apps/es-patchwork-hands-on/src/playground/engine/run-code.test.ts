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

describe('Node に合わせた振る舞い', () => {
  it('prepare の時点で SQL のエラーを投げ、エラーには code が付く', async () => {
    const outcome = await run({
      'main.ts': `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(':memory:');
        try { db.prepare('SELECT * FROM missing'); } catch (error) { console.log((error as { code: string }).code, (error as Error).message); }
      `,
    }, 'main.ts');
    expect(outcome.logs[0]?.text).toBe('ERR_SQLITE_ERROR no such table: missing');
  });

  it('存在しない名前付きパラメーターはエラーにする', async () => {
    const outcome = await run({
      'main.ts': `
        import { DatabaseSync } from 'node:sqlite';
        new DatabaseSync(':memory:').prepare('SELECT :a AS x').get({ a: 1, b: 2 });
      `,
    }, 'main.ts');
    expect(outcome.error).toBe('Error: Unknown named parameter \'b\'');
  });

  it('拡張子なしの相対 import は解決しない', async () => {
    const outcome = await run({
      'main.ts': 'import { a } from \'./util\';\nconsole.log(a);',
      'util.ts': 'export const a = 1;',
    }, 'main.ts');
    expect(outcome.error).toContain('Cannot find module');
  });

  it('enum とコンストラクタ引数のプロパティは型の除去だけでは動かないのでエラーにする', async () => {
    const enumOutcome = await run({ 'main.ts': 'enum Color { Red }\nconsole.log(Color.Red);' }, 'main.ts');
    expect(enumOutcome.error).toBe('SyntaxError: main.ts: TypeScript enum is not supported in strip-only mode');
    const propertyOutcome = await run({
      'main.ts': 'class A {\n  constructor(private readonly x: number) {}\n}\nconsole.log(new A(1));',
    }, 'main.ts');
    expect(propertyOutcome.error).toBe(
      'SyntaxError: main.ts: TypeScript parameter property is not supported in strip-only mode',
    );
    const textOutcome = await run(
      { 'main.ts': 'console.log(\'enum Color {\' + `constructor(private x)`);' },
      'main.ts',
    );
    expect(textOutcome.error).toBeNull();
  });

  it('type なしで型だけを import するとエラーにする', async () => {
    const files = { 'types.ts': 'export type A = number;\nexport const b = 1;' };
    const bad = await run({ ...files, 'main.ts': 'import { A, b } from \'./types.ts\';\nconsole.log(b);' }, 'main.ts');
    expect(bad.error).toBe(
      'SyntaxError: The requested module \'./types.ts\' does not provide an export named \'A\'',
    );
    const good = await run(
      { ...files, 'main.ts': 'import { type A, b } from \'./types.ts\';\nconsole.log(b);' },
      'main.ts',
    );
    expect(good.error).toBeNull();
  });

  it('describe の本体が例外を投げたら 1 件の失敗にし、関数なしの it と only は成功にする', async () => {
    const outcome = await run({
      'main.test.ts': `
        import { describe, it } from 'node:test';
        it('関数なし');
        it.only('only', () => {});
        describe('壊れた', () => { throw new Error('本体の失敗'); });
      `,
    }, 'main.test.ts');
    expect(outcome.tests?.map((test) => [test.name, test.status, test.message])).toEqual([
      ['関数なし', 'pass', null],
      ['only', 'pass', null],
      ['壊れた', 'fail', '本体の失敗'],
    ]);
  });
});

describe('出力の上限', () => {
  it('console の行数、合計文字数、1 行の文字数に上限がある', async () => {
    const lines = await run({ 'main.ts': 'for (let i = 0; i < 20000; i += 1) console.log(\'line \' + i);' }, 'main.ts');
    expect(lines.logs).toHaveLength(1000);
    expect(lines.logSummary).toEqual({ totalLines: 20000, shownLines: 1000, cutLines: 0 });
    const chars = await run(
      { 'main.ts': 'for (let i = 0; i < 100; i += 1) console.log(\'x\'.repeat(5000));' },
      'main.ts',
    );
    expect(chars.logs.length).toBeLessThan(30);
    expect(chars.logs.reduce((sum, line) => sum + line.text.length, 0)).toBeLessThan(110_000);
    const long = await run({ 'main.ts': 'console.log(\'y\'.repeat(1_000_000));' }, 'main.ts');
    expect(long.logs[0]?.text).toHaveLength(10_001);
    expect(long.logSummary.cutLines).toBe(1);
  });

  it('テストの失敗メッセージに上限がある', async () => {
    const outcome = await run({
      'main.test.ts':
        'import { it } from \'node:test\';\nit(\'長い\', () => { throw new Error(\'z\'.repeat(100000)); });',
    }, 'main.test.ts');
    expect(outcome.tests?.[0]?.message).toHaveLength(2001);
    expect(outcome.cutMessages).toBe(1);
  });

  it('SQL の 1 セルの文字数に上限があり、大きな zeroblob はエラーにする', () => {
    const session = createSqlSession(SQL);
    session.reset('');
    const cell = session.run('SELECT hex(zeroblob(500000)) AS h').results[0];
    expect(cell).toMatchObject({ kind: 'rows', cutCells: 1 });
    expect(cell?.kind === 'rows' ? String(cell.rows[0]?.[0]).length : 0).toBe(1001);
    expect(session.run('SELECT hex(zeroblob(50000000)) AS h').error?.message).toBe('string or blob too big');
    expect(session.run('SELECT length(randomblob(10)) AS n').results[0]).toMatchObject({ rows: [[10]] });
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
