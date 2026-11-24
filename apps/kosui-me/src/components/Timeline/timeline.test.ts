import { describe, expect, it } from 'vitest';

import { formatMonthDay, groupByYear, type TimelineEntry, yearOf } from './timeline';

const entry = (date: string, title: string): TimelineEntry => ({
  kind: 'post',
  date,
  title,
  href: `/${title}`,
  external: false,
  themes: [],
});

describe('yearOf / formatMonthDay', () => {
  it('日本時間で年と月日を返す', () => {
    expect(yearOf('2026-11-15T00:30:00+09:00')).toBe('2026');
    expect(formatMonthDay('2026-11-15T00:30:00+09:00')).toBe('11.15');
  });

  it('UTC では前の年でも、日本時間で年が明けていれば新しい年にする', () => {
    expect(yearOf('2025-12-31T15:30:00Z')).toBe('2026');
    expect(formatMonthDay('2025-12-31T15:30:00Z')).toBe('01.01');
  });
});

describe('groupByYear', () => {
  it('新しい順に並べ、年ごとにまとめる', () => {
    const groups = groupByYear([
      entry('2025-05-06T14:28:42+09:00', 'b'),
      entry('2026-11-15T00:30:00+09:00', 'a'),
      entry('2025-10-23T21:47:10+09:00', 'c'),
      entry('2019-06-25T00:00:00+09:00', 'd'),
    ]);
    expect(groups.map((g) => g.year)).toEqual(['2026', '2025', '2019']);
    expect(groups[1]?.entries.map((e) => e.title)).toEqual(['c', 'b']);
  });

  it('項目がなければ、空を返す', () => {
    expect(groupByYear([])).toEqual([]);
  });
});
