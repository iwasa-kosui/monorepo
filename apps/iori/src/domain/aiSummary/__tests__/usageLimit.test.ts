import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { secondsUntilNextJstDay } from '../usageLimit.ts';

const at = (...parts: Parameters<typeof Date.UTC>) => Instant.orThrow(Date.UTC(...parts));

describe('secondsUntilNextJstDay', () => {
  it('日本時間の 0 時ちょうどは 24 時間後を返す', () => {
    expect(secondsUntilNextJstDay(at(2026, 10, 3, 15, 0, 0, 0))).toBe(86_400);
  });

  it('日本時間の 23:59:59.500 は 1 秒に切り上げる', () => {
    expect(secondsUntilNextJstDay(at(2026, 10, 4, 14, 59, 59, 500))).toBe(1);
  });

  it('日本時間の正午は 12 時間後を返す', () => {
    expect(secondsUntilNextJstDay(at(2026, 10, 4, 3, 0, 0, 0))).toBe(12 * 60 * 60);
  });

  it('UTC の 0 時は日本時間の 9 時なので 15 時間後を返す', () => {
    expect(secondsUntilNextJstDay(at(2026, 10, 4, 0, 0, 0, 0))).toBe(15 * 60 * 60);
  });
});
