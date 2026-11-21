import { describe, expect, it } from 'vitest';

import { groupPages } from './lesson-frame';

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
