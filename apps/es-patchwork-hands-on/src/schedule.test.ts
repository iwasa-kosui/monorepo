import { describe, expect, it } from 'vitest';

import { withTimeRanges } from './schedule';

describe('withTimeRanges', () => {
  it('前の章の分数を積み上げて時間の範囲を作る', () => {
    const rows = withTimeRanges([
      { id: 'a', title: 'A', minutes: 8 },
      { id: 'b', title: 'B', minutes: 14 },
    ]);
    expect(rows.map((row) => row.range)).toEqual(['0:00〜0:08（8分）', '0:08〜0:22（14分）']);
  });
});
