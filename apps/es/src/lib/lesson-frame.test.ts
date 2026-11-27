import { describe, expect, it } from 'vitest';

import { groupPages, overallPosition } from './lesson-frame';

const pages = [
  { chapter: 'intro' },
  { chapter: 'intro' },
  { chapter: 'chapter-1' },
  { chapter: 'chapter-1' },
  { chapter: 'summary' },
];

describe('groupPages', () => {
  it('隣り合う同じ章のページを1つの群にまとめる', () => {
    expect(groupPages(pages, 0).map((group) => [group.chapter, group.members.length])).toEqual([
      ['intro', 2],
      ['chapter-1', 2],
      ['summary', 1],
    ]);
  });

  it('現在より前を past、現在を current、後を future にする', () => {
    expect(groupPages(pages, 2).flatMap((group) => group.members.map((member) => member.route))).toEqual([
      'past',
      'past',
      'current',
      'future',
      'future',
    ]);
  });

  it('現在のページを含む群だけ hasCurrent が true になる', () => {
    expect(groupPages(pages, 2).map((group) => group.hasCurrent)).toEqual([false, true, false]);
  });

  it('現在のページの位置が範囲外ならエラーにする', () => {
    expect(() => groupPages(pages, 5)).toThrow();
  });
});

describe('overallPosition', () => {
  const numbered = [
    { chapter: 'intro', number: 1 },
    { chapter: 'intro', number: 2 },
    { chapter: 'chapter-1', number: 1 },
    { chapter: 'chapter-1', number: 2 },
    { chapter: 'summary', number: 1 },
  ];

  it('章をまたいだ通し番号と総数を返す', () => {
    expect(overallPosition(numbered, 'chapter-1', 2)).toEqual({ number: 4, total: 5 });
  });

  it('ページを1つ足すと、後ろのページの通し番号と総数が1ずつ増える', () => {
    const extended = [...numbered.slice(0, 2), { chapter: 'intro', number: 3 }, ...numbered.slice(2)];
    const before = overallPosition(numbered, 'summary', 1);
    const after = overallPosition(extended, 'summary', 1);
    expect(after).toEqual({ number: before!.number + 1, total: before!.total + 1 });
  });

  it('該当するページが無いと undefined を返す', () => {
    expect(overallPosition(numbered, 'chapter-2', 1)).toBeUndefined();
  });
});
