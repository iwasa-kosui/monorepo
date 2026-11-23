import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { schedule } from '../schedule';
import { elapsedMinutes, firstHeading, formatElapsed, pageLabel } from './page-guide';

const pageCount = (chapter: string): number =>
  readdirSync(fileURLToPath(new URL(`../content/chapters/${chapter}/`, import.meta.url))).filter((file) =>
    file.endsWith('.mdx')
  ).length;

describe('elapsedMinutes', () => {
  const evenRows = schedule.map(({ id, minutes }) => ({ id, minutes }));

  const startOf = (chapter: string): number => {
    const index = schedule.findIndex((row) => row.id === chapter);
    return schedule.slice(0, index).reduce((sum, row) => sum + row.minutes, 0);
  };

  it('章の最初のページは章の開始時刻になる', () => {
    for (const row of evenRows) {
      for (const total of [1, 3, 7]) {
        expect(elapsedMinutes(evenRows, row.id, 1, total)).toBe(startOf(row.id));
      }
    }
  });

  it('章の最後のページは章の終了時刻より前になる', () => {
    for (const row of evenRows) {
      for (let total = 1; total <= 10; total += 1) {
        expect(elapsedMinutes(evenRows, row.id, total, total)).toBeLessThan(startOf(row.id) + row.minutes);
      }
    }
  });

  it('章をまたいでも、ページが進むほど減らない', () => {
    for (let total = 1; total <= 10; total += 1) {
      const times = evenRows.flatMap((row) =>
        Array.from({ length: total }, (_, index) => elapsedMinutes(evenRows, row.id, index + 1, total))
      );
      expect(times).toEqual(times.toSorted((a, b) => a - b));
    }
  });

  it('章の分数を、章のページ数で均等に割った時刻にする', () => {
    expect(elapsedMinutes(evenRows, 'chapter-2', 4, 6)).toBe(9 + 7);
  });

  it('pageStarts がある章は、その分を章の開始時刻に足す', () => {
    expect(elapsedMinutes(schedule, 'chapter-2', 4, 6)).toBe(9 + 2);
    expect(elapsedMinutes(schedule, 'chapter-2', 5, 6)).toBe(9 + 7);
  });

  it('pageStarts の長さがページ数と合わないときはエラーにする', () => {
    expect(() => elapsedMinutes(schedule, 'chapter-2', 1, 5)).toThrow('chapter-2');
  });

  it('schedule に無い章はエラーにする', () => {
    expect(() => elapsedMinutes(schedule, 'unknown', 1, 1)).toThrow('unknown');
  });
});

describe('schedule の pageStarts', () => {
  const withStarts = schedule.flatMap((row) =>
    row.pageStarts === undefined ? [] : [{ id: row.id, minutes: row.minutes, pageStarts: row.pageStarts }]
  );

  it('第2章と第4章が持つ', () => {
    expect(withStarts.map((row) => row.id)).toEqual(['chapter-2', 'chapter-4']);
  });

  for (const row of withStarts) {
    describe(row.id, () => {
      it('長さが章のページ数と一致する', () => {
        expect(row.pageStarts).toHaveLength(pageCount(row.id));
      });

      it('先頭が 0 で、減らず、最後が章の分数より小さい', () => {
        expect(row.pageStarts[0]).toBe(0);
        expect(row.pageStarts).toEqual(row.pageStarts.toSorted((a, b) => a - b));
        expect(row.pageStarts.at(-1)).toBeLessThan(row.minutes);
      });
    });
  }

  it('第2章の4ページ目は 0:11、5ページ目は 0:16 になる', () => {
    expect(formatElapsed(elapsedMinutes(schedule, 'chapter-2', 4, 6))).toBe('0:11');
    expect(formatElapsed(elapsedMinutes(schedule, 'chapter-2', 5, 6))).toBe('0:16');
  });

  it('第4章の判断表のページ（5ページ目）は、実演7分の後に始まる', () => {
    expect(formatElapsed(elapsedMinutes(schedule, 'chapter-4', 5, 6))).toBe('0:35');
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
