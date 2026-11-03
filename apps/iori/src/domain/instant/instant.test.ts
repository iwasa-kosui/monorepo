import { describe, expect, it } from 'vitest';

import { Instant } from './instant.ts';

describe('Instant.toJstDate', () => {
  it('UTC 14:59:59.999 は同じ日、UTC 15:00:00.000 は翌日の日本時間の日付にする', () => {
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 10, 4, 14, 59, 59, 999)))).toBe('2026-11-04');
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 10, 4, 15, 0, 0, 0)))).toBe('2026-11-05');
  });

  it('日本時間の 0:00 と 23:59 は同じ日付になる', () => {
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 10, 3, 15, 0, 0, 0)))).toBe('2026-11-04');
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 10, 4, 14, 59, 0, 0)))).toBe('2026-11-04');
  });

  it('毎朝 6:30 の cron の時刻（UTC 21:30）は翌日の日付になる', () => {
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30)))).toBe('2026-11-05');
  });

  it('月末と年末の境目をまたぐ', () => {
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2026, 11, 31, 15, 0)))).toBe('2027-01-01');
    expect(Instant.toJstDate(Instant.orThrow(Date.UTC(2028, 1, 28, 15, 0)))).toBe('2028-02-29');
  });

  it('エポックの瞬間は 1970-01-01', () => {
    expect(Instant.toJstDate(Instant.orThrow(0))).toBe('1970-01-01');
  });
});
