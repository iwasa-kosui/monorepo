import { Console } from 'node:console';
import { Writable } from 'node:stream';
import { inspect as nodeInspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { formatLog, formatTable } from './console.ts';
import { inspect } from './inspect.ts';

const nullPrototype = (value: Record<string, unknown>): object => Object.assign(Object.create(null), value);

class Visit {
  id = 'visit-1';
}

const samples: [string, unknown][] = [
  ['文字列', 'こんにちは'],
  ['引用符を含む文字列', 'it\'s'],
  ['改行を含む文字列', 'a\nb'],
  ['数値', -0],
  ['bigint', 10n],
  ['null と undefined', [null, undefined]],
  ['配列', [1, 2, 3]],
  ['空の配列と空のオブジェクト', { a: [], b: {} }],
  ['入れ子のオブジェクト', { a: { b: { c: { d: 1 } } } }],
  ['null プロトタイプ', nullPrototype({ id: 'visit-1', status: 'cancelled' })],
  ['クラスのインスタンス', new Visit()],
  ['日付', new Date('2026-11-08T00:00:00.000Z')],
  ['キーに記号を含むオブジェクト', { 'a-b': 1, c: 2 }],
  ['長いオブジェクト', {
    visitId: 'visit-1',
    petName: 'ポチ',
    reason: '飼い主の都合',
    operatedBy: '受付スタッフ',
    status: 'cancelled',
  }],
  ['省略される配列', { items: Array.from({ length: 4 }, (_, index) => ({ index })) }],
  ['Map と Set', { map: new Map([['a', 1]]), set: new Set([1, 2]) }],
  ['関数', [function named() {}, () => {}]],
  ['正規表現', /a+b/g],
];

describe('inspect', () => {
  for (const [name, value] of samples) {
    it(`${name}を Node の util.inspect と同じ文字列にする`, () => {
      expect(inspect(value)).toBe(nodeInspect(value));
    });
  }
});

const nodeTable = (data: unknown): string => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += String(chunk);
      callback();
    },
  });
  new Console({ stdout: stream, colorMode: false }).table(data);
  return output.trimEnd();
};

describe('console.table', () => {
  const rows = [
    nullPrototype({ id: 'visit-pochi', status: 'cancelled', operated_by: '受付スタッフ', reason: null }),
    nullPrototype({ id: 'visit-tama', status: 'cancelled', operated_by: null, reason: null }),
  ];
  const cases: [string, unknown][] = [
    ['日本語を含む行の配列', rows],
    ['入れ子のオブジェクトを含む行', [{ message: { visitId: 'v', petName: 'ポチ' }, list: [1, 2, 3, 4] }]],
    ['3 つ以上のキーを持つ入れ子', [{ nested: { a: 1, b: 2, c: 3 } }]],
    ['値の配列', [1, 'two', null]],
    ['行の列が揃わない配列', [{ a: 1 }, { b: 2 }]],
  ];
  for (const [name, data] of cases) {
    it(`${name}を Node と同じ表にする`, () => {
      expect(formatTable(data)).toBe(nodeTable(data));
    });
  }
});

describe('console.log の書式', () => {
  it('文字列とオブジェクトを空白でつなぐ', () => {
    expect(formatLog(['visit', { id: 1 }, 'done'])).toBe('visit { id: 1 } done');
  });

  it('%s、%d、%j を置き換える', () => {
    expect(formatLog(['%s は %d 件 %j', 'ポチ', 3, { a: 1 }])).toBe('ポチ は 3 件 {"a":1}');
  });
});
