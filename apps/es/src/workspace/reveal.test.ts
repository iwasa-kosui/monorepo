import { describe, expect, it } from 'vitest';

import { revealOffset } from './reveal';

describe('revealOffset', () => {
  const frame = { top: 100, bottom: 300 };

  it('枠の中に収まっているときは動かさない', () => {
    expect(revealOffset(frame, { top: 120, bottom: 280 })).toBe(0);
  });

  it('枠の下にはみ出しているときは、下端が見えるところまで進める', () => {
    expect(revealOffset(frame, { top: 250, bottom: 400 })).toBe(100);
  });

  it('枠より下にあって高さが 0 のときも、見えるところまで進める', () => {
    expect(revealOffset(frame, { top: 360, bottom: 360 })).toBe(60);
  });

  it('枠の上にはみ出しているときは、上端が見えるところまで戻す', () => {
    expect(revealOffset(frame, { top: 40, bottom: 180 })).toBe(-60);
  });

  it('枠より高いときは、上端を枠の上端に合わせる', () => {
    expect(revealOffset(frame, { top: 250, bottom: 700 })).toBe(150);
    expect(revealOffset(frame, { top: 100, bottom: 700 })).toBe(0);
  });
});
