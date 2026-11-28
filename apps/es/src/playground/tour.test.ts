import { describe, expect, it } from 'vitest';

import { countLines, locateTourRange, splitBody, tourAnnouncement, tourPosition } from './tour';

const source = [
  'import a from "a";',
  '',
  'export const first = () => {',
  '  return 1;',
  '};',
  '',
  'export const second = () => {',
  '  return 2;',
  '};',
].join('\n');

describe('locateTourRange', () => {
  it('手がかりのある行から、指定した行数の範囲を返す', () => {
    expect(locateTourRange(source, 'export const first = ', 3)).toEqual({ first: 3, last: 5 });
  });

  it('手がかりが行の途中にあっても、その行から始まる', () => {
    expect(locateTourRange(source, 'const second', 3)).toEqual({ first: 7, last: 9 });
  });

  it('手がかりが見つからないときは null を返す', () => {
    expect(locateTourRange(source, 'export const third', 3)).toBeNull();
  });

  it('手がかりが空の文字列のときは null を返す', () => {
    expect(locateTourRange(source, '', 3)).toBeNull();
  });

  it('範囲が文書の終わりを超えるときは、最後の行までに収める', () => {
    expect(locateTourRange(source, 'export const second', 10)).toEqual({ first: 7, last: 9 });
  });

  it('行数が 1 の範囲は、その行だけを指す', () => {
    expect(locateTourRange(source, 'import a', 1)).toEqual({ first: 1, last: 1 });
  });

  it('文書の途中に行が足された後も、同じコードに付いていく', () => {
    const before = locateTourRange(source, 'export const second', 3);
    const edited = source.replace('export const first', '// 追加\n// 追加\nexport const first');
    const after = locateTourRange(edited, 'export const second', 3);
    expect(before).toEqual({ first: 7, last: 9 });
    expect(after).toEqual({ first: 9, last: 11 });
  });

  it('手がかりの行を書き換えると、見つからなくなる', () => {
    const edited = source.replace('export const second', 'export const renamed');
    expect(locateTourRange(edited, 'export const second', 3)).toBeNull();
  });
});

describe('countLines', () => {
  it('改行で区切った行の数を返す', () => {
    expect(countLines(source)).toBe(9);
  });

  it('末尾の改行の後ろに、空の行を数える', () => {
    expect(countLines('a\nb\n')).toBe(3);
  });
});

describe('splitBody', () => {
  it('バッククォートで囲んだ部分を、コードとして分ける', () => {
    expect(splitBody('`Visit.cancel` に判定を任せます')).toEqual([
      { text: 'Visit.cancel', code: true },
      { text: ' に判定を任せます', code: false },
    ]);
  });

  it('文の途中と末尾にあるコードも分ける', () => {
    expect(splitBody('a `b` c `d`')).toEqual([
      { text: 'a ', code: false },
      { text: 'b', code: true },
      { text: ' c ', code: false },
      { text: 'd', code: true },
    ]);
  });

  it('バッククォートがなければ、全体を1つの文字列として返す', () => {
    expect(splitBody('説明だけ')).toEqual([{ text: '説明だけ', code: false }]);
  });
});

describe('tourPosition と tourAnnouncement', () => {
  it('現在の位置を、1から数えた番号で表す', () => {
    expect(tourPosition(2, 8)).toBe('ツアー 3 / 8');
  });

  it('通知の文は、位置と題を空白でつなぐ', () => {
    const tour = { title: '題', steps: [{ file: 'a.ts', anchor: 'a', lines: 1, title: '最初', body: '本文' }] };
    expect(tourAnnouncement(tour, 0)).toBe('ツアー 1 / 1 最初');
  });
});
