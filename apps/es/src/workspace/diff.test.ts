import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { diffFiles } from './diff';

const exercise = (snapshot: string): string =>
  readFileSync(new URL(`../../exercises/${snapshot}/visits.ts`, import.meta.url), 'utf8');

describe('行単位の差分', () => {
  it('変更が無ければ、行も塊も出ない', () => {
    expect(diffFiles('a\nb\n', 'a\nb\n')).toEqual({ added: 0, deleted: 0, hunks: [] });
  });

  it('変更した行は、削除と追加の組になる', () => {
    const diff = diffFiles('a\nb\nc\n', 'a\nB\nc\n', 1);
    expect(diff.added).toBe(1);
    expect(diff.deleted).toBe(1);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]?.header).toBe('@@ -1,3 +1,3 @@');
    expect(diff.hunks[0]?.lines.map((line) => [line.kind, line.text])).toEqual([
      ['same', 'a'],
      ['del', 'b'],
      ['add', 'B'],
      ['same', 'c'],
    ]);
  });

  it('離れた変更は、別の塊に分かれる', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].join('\n');
    const after = ['1!', '2', '3', '4', '5', '6', '7', '8', '9!'].join('\n');
    expect(diffFiles(before, after, 1).hunks).toHaveLength(2);
    expect(diffFiles(before, after, 4).hunks).toHaveLength(1);
  });

  it('行番号は、変更前と変更後のそれぞれで数える', () => {
    const lines = diffFiles('a\nb\n', 'a\nx\nb\n', 5).hunks[0]?.lines ?? [];
    expect(lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ['same', 1, 1],
      ['add', undefined, 2],
      ['same', 2, 3],
    ]);
  });

  it('第1章の開始時点から第2章のステップ2までの visits.ts は、+13/-1 行になる', () => {
    const diff = diffFiles(exercise('chapter-1-start'), exercise('chapter-2-step-2'));
    expect([diff.added, diff.deleted]).toEqual([13, 1]);
  });
});
