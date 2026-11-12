import { describe, expect, it } from 'vitest';

import { schedule } from '../schedule';
import { elapsedMinutes, firstHeading, formatElapsed, pageLabel } from './page-guide';

describe('elapsedMinutes', () => {
  const startOf = (chapter: string): number => {
    const index = schedule.findIndex((row) => row.id === chapter);
    return schedule.slice(0, index).reduce((sum, row) => sum + row.minutes, 0);
  };

  it('章の最初のページは章の開始時刻になる', () => {
    for (const row of schedule) {
      for (const total of [1, 3, 7]) {
        expect(elapsedMinutes(schedule, row.id, 1, total)).toBe(startOf(row.id));
      }
    }
  });

  it('章の最後のページは章の終了時刻より前になる', () => {
    for (const row of schedule) {
      for (let total = 1; total <= 10; total += 1) {
        expect(elapsedMinutes(schedule, row.id, total, total)).toBeLessThan(startOf(row.id) + row.minutes);
      }
    }
  });

  it('章をまたいでも、ページが進むほど減らない', () => {
    for (let total = 1; total <= 10; total += 1) {
      const times = schedule.flatMap((row) =>
        Array.from({ length: total }, (_, index) => elapsedMinutes(schedule, row.id, index + 1, total))
      );
      expect(times).toEqual(times.toSorted((a, b) => a - b));
    }
  });

  it('章の分数を、章のページ数で均等に割った時刻にする', () => {
    expect(elapsedMinutes(schedule, 'chapter-2', 4, 6)).toBe(9 + 7);
  });

  it('schedule に無い章はエラーにする', () => {
    expect(() => elapsedMinutes(schedule, 'unknown', 1, 1)).toThrow('unknown');
  });
});

describe('formatElapsed', () => {
  it('分を 時:分 の形にする', () => {
    expect(formatElapsed(13)).toBe('0:13');
    expect(formatElapsed(65)).toBe('1:05');
  });
});

describe('firstHeading', () => {
  it('最初の ## か ### の見出しのテキストを返す', () => {
    expect(firstHeading('本文\n\n### 小見出し\n\n## 大見出し\n')).toBe('小見出し');
    expect(firstHeading('## 説明\n\n### 次\n')).toBe('説明');
  });

  it('コードブロックの中の # は見出しとして扱わない', () => {
    expect(firstHeading('```md\n## 偽物\n```\n\n## 本物')).toBe('本物');
    expect(firstHeading('~~~\n## 偽物\n~~~')).toBeUndefined();
  });

  it('見出しの中の記法を外して文字だけにする', () => {
    expect(firstHeading('## `visits` テーブルを [SQL](/x) で **調べる**')).toBe('visits テーブルを SQL で 調べる');
  });

  it('単語の途中の _ は残す', () => {
    expect(firstHeading('### business_events テーブル')).toBe('business_events テーブル');
  });

  it('# や #### は対象にしない', () => {
    expect(firstHeading('# 題\n#### 細かい')).toBeUndefined();
  });

  it('見出しが無い、本文が無いときは undefined を返す', () => {
    expect(firstHeading('文章だけ')).toBeUndefined();
    expect(firstHeading(undefined)).toBeUndefined();
  });
});

describe('pageLabel', () => {
  it('番号と見出しをつなぎ、見出しが無ければ「N ページ目」にする', () => {
    expect(pageLabel(2, '説明')).toBe('2 説明');
    expect(pageLabel(4, undefined)).toBe('4 ページ目');
  });
});
