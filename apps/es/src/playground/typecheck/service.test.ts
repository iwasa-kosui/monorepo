import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { createTypecheckService } from './service.ts';

const exercisesDir = join(import.meta.dirname, '..', '..', '..', 'exercises');

const snapshots = ['chapter-1-start', 'chapter-2-step-1', 'chapter-2-step-2-start', 'chapter-2-step-2'];

const filesOf = (snapshot: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(exercisesDir, snapshot))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => [name, readFileSync(join(exercisesDir, snapshot, name), 'utf8')]),
  );

describe('演習のファイルの診断', () => {
  for (const snapshot of snapshots) {
    const files = filesOf(snapshot);
    const service = createTypecheckService(ts, files);
    for (const [name, text] of Object.entries(files)) {
      it(`${snapshot}/${name} に診断が出ない`, () => {
        expect(service.diagnostics(name, text)).toEqual([]);
      });
    }
  }

  it('演習のファイルは、第2章の4つの snapshot に5ファイルずつある', () => {
    for (const snapshot of snapshots) {
      expect(Object.keys(filesOf(snapshot)).sort()).toEqual([
        'db.ts',
        'show-visits.ts',
        'visits.test.ts',
        'visits.ts',
        'who-cancelled.ts',
      ]);
    }
  });
});

describe('型エラーの検出', () => {
  const files = filesOf('chapter-1-start');
  const text = files['visits.ts'] ?? '';

  it('型に足していないプロパティを参照すると、診断が出る', () => {
    const service = createTypecheckService(ts, files);
    const broken = text.replace(
      'db.prepare(`UPDATE visits SET status = \'cancelled\' WHERE id = ?`).run(input.visitId);',
      'db.prepare(`UPDATE visits SET status = \'cancelled\' WHERE id = ?`).run(input.visitId, input.reason);',
    );
    expect(broken).not.toBe(text);
    const found = service.diagnostics('visits.ts', broken);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0]?.severity).toBe('error');
    expect(found[0]?.message).toContain('reason');
    expect(broken.slice(found[0]?.from, found[0]?.to)).toBe('reason');
  });

  it('直すと診断が消える', () => {
    const service = createTypecheckService(ts, files);
    const broken = `${text}\nexport const broken: number = 'text';\n`;
    expect(service.diagnostics('visits.ts', broken).length).toBeGreaterThanOrEqual(1);
    expect(service.diagnostics('visits.ts', text)).toEqual([]);
  });

  it('構文エラーも診断に出る', () => {
    const service = createTypecheckService(ts, files);
    expect(service.diagnostics('visits.ts', `${text}\nconst = ;\n`).length).toBeGreaterThanOrEqual(1);
  });

  it('メッセージは日本語になる', () => {
    const service = createTypecheckService(ts, files);
    const found = service.diagnostics('visits.ts', `${text}\nexport const broken: number = 'text';\n`);
    expect(found[0]?.message).toContain('型');
  });

  it('erasableSyntaxOnly に反する構文を診断する', () => {
    const service = createTypecheckService(ts, files);
    expect(service.diagnostics('visits.ts', `${text}\nexport enum Status { Reserved }\n`).length)
      .toBeGreaterThanOrEqual(
        1,
      );
  });
});

describe('ambient 宣言', () => {
  const sample = [
    `import assert, { ok } from 'node:assert/strict';`,
    `import legacy from 'node:assert';`,
    `import test, { after, afterEach, before, beforeEach, describe, it } from 'node:test';`,
    `import { DatabaseSync } from 'node:sqlite';`,
    `const db = new DatabaseSync(':memory:');`,
    `db.exec('CREATE TABLE t (id INTEGER, name TEXT)');`,
    `const result = db.prepare('INSERT INTO t VALUES (?, ?)').run(1, 'a');`,
    `const rows = db.prepare('SELECT * FROM t WHERE id = :id').all({ id: 1 });`,
    `const row = db.prepare('SELECT * FROM t').get();`,
    `for (const each of db.prepare('SELECT * FROM t').iterate()) console.log(each);`,
    `console.table(rows);`,
    `console.error(result.changes, row?.name);`,
    `test('a', () => {});`,
    `describe('b', () => { before(() => {}); after(() => {}); beforeEach(() => {}); afterEach(() => {}); });`,
    `it.skip('c', async () => { assert.equal(1, 1); ok(true); legacy.deepEqual({}, {}); });`,
    `it('d', () => { assert.throws(() => { throw new Error('x'); }, /x/); assert.match('a', /a/); });`,
    `it('e', async () => { await assert.rejects(Promise.reject(new Error('x')), /x/); });`,
    `db.close();`,
  ].join('\n');

  it('演習で使う API は、診断が出ない', () => {
    const service = createTypecheckService(ts, { 'sample.ts': sample });
    expect(service.diagnostics('sample.ts', sample)).toEqual([]);
  });

  it('存在しない API は、診断が出る', () => {
    const service = createTypecheckService(ts, { 'sample.ts': sample });
    const broken = `${sample}\ndb.missing();\n`;
    expect(service.diagnostics('sample.ts', broken).length).toBeGreaterThanOrEqual(1);
  });
});

describe('補完', () => {
  const files = filesOf('chapter-1-start');
  const text = files['visits.ts'] ?? '';

  it('db. の後に prepare と exec が出る', () => {
    const service = createTypecheckService(ts, files);
    const source = `${text}\nexport const probe = (db: import('node:sqlite').DatabaseSync): void => {\n  db.\n};\n`;
    const position = source.indexOf('db.\n') + 3;
    const labels = service.completions('visits.ts', source, position, '.').map((entry) => entry.label);
    expect(labels).toContain('prepare');
    expect(labels).toContain('exec');
  });

  it('input. の後にプロパティが出る', () => {
    const service = createTypecheckService(ts, files);
    const source = `${text}\nexport const probe = (input: { visitId: string }): void => {\n  input.\n};\n`;
    const position = source.indexOf('input.\n') + 6;
    const labels = service.completions('visits.ts', source, position, '.').map((entry) => entry.label);
    expect(labels).toContain('visitId');
  });

  it('識別子の途中で、スコープ内の名前が出る', () => {
    const service = createTypecheckService(ts, files);
    const source = `${text}\nexport const probe = (): void => {\n  with\n};\n`;
    const position = source.indexOf('with\n') + 4;
    const labels = service.completions('visits.ts', source, position, null).map((entry) => entry.label);
    expect(labels).toContain('withTransaction');
  });

  it('ホバーで型を返す', () => {
    const service = createTypecheckService(ts, files);
    const position = text.indexOf('reserveVisit') + 2;
    const info = service.quickInfo('visits.ts', text, position);
    expect(info?.text).toContain('reserveVisit');
  });
});
