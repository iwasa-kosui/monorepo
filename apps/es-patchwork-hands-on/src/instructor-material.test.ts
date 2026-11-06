import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { schedule, withTimeRanges } from './schedule';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('講師向けの資料', () => {
  it('台本の時間割が schedule と一致する', () => {
    const script = read('docs/instructor-script.md');
    for (const row of withTimeRanges(schedule)) {
      expect(script).toContain(row.range);
      if (row.parts) {
        expect(script).toContain(row.parts);
      }
    }
  });

  it('トラブルシュートのページが引用するテストの失敗の文が演習に実在する', () => {
    const page = read('src/pages/troubleshooting.mdx');
    const exercise = read('exercises/chapter-2-step-2/visits.test.ts');
    for (
      const message of [
        'キャンセルした人を答えられません',
        '来院キャンセルの記録がありません',
        '記録の失敗が更新処理に伝わっていません',
      ]
    ) {
      expect(page).toContain(message);
      expect(exercise).toContain(message);
    }
  });
});
