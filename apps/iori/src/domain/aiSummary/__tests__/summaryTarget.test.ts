import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { SummaryTarget } from '../summaryTarget.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 3, 0, 0));
const iso = (...parts: Parameters<typeof Date.UTC>) => new Date(Date.UTC(...parts)).toISOString();

const failedField = (input: unknown) => {
  const parsed = SummaryTarget.parse(input, now);
  return parsed.ok ? undefined : parsed.err.field;
};

describe('SummaryTarget.parse', () => {
  it('q だけなら検索の要約で、limit は 40 にする', () => {
    const parsed = SummaryTarget.parse({ q: '  京都 旅行 ' }, now);

    expect(parsed).toEqual({
      ok: true,
      val: { type: 'search', query: { text: '京都 旅行', limit: 40 }, since: undefined, until: undefined },
    });
  });

  it('q と since と until があれば期間つきの検索の要約にする', () => {
    const parsed = SummaryTarget.parse({ q: '京都', since: iso(2026, 10, 1), until: iso(2026, 10, 2) }, now);

    expect(parsed.ok && parsed.val).toMatchObject({
      type: 'search',
      since: Date.UTC(2026, 10, 1),
      until: Date.UTC(2026, 10, 2),
    });
  });

  it('q がなく since と until があれば期間の要約にする', () => {
    const parsed = SummaryTarget.parse({ since: iso(2026, 10, 3), until: iso(2026, 10, 4) }, now);

    expect(parsed).toEqual({
      ok: true,
      val: { type: 'period', since: Date.UTC(2026, 10, 3), until: Date.UTC(2026, 10, 4) },
    });
  });

  it('タイムゾーンのオフセットつきの日時を読む', () => {
    const parsed = SummaryTarget.parse({ since: '2026-11-03T09:00:00+09:00', until: '2026-11-04T09:00:00+09:00' }, now);

    expect(parsed.ok && parsed.val).toMatchObject({ since: Date.UTC(2026, 10, 3), until: Date.UTC(2026, 10, 4) });
  });

  it('q が 200 文字を超えるか空だと q の不正にする', () => {
    expect(failedField({ q: 'あ'.repeat(201) })).toBe('q');
    expect(failedField({ q: '   ' })).toBe('q');
    expect(failedField({ q: 1 })).toBe('q');
    expect(SummaryTarget.parse({ q: 'あ'.repeat(200) }, now).ok).toBe(true);
  });

  it('期間の要約は since と until の両方が要る', () => {
    expect(failedField({})).toBe('since');
    expect(failedField({ since: iso(2026, 10, 3) })).toBe('until');
    expect(failedField({ until: iso(2026, 10, 3) })).toBe('since');
  });

  it('日時でない since と until は不正にする', () => {
    expect(failedField({ since: 'yesterday', until: iso(2026, 10, 4) })).toBe('since');
    expect(failedField({ since: iso(2026, 10, 3), until: '2026-11-04' })).toBe('until');
    expect(failedField({ q: '京都', since: null })).toBe('since');
  });

  it('until が現在より後だと不正にし、現在ちょうどは許す', () => {
    expect(failedField({ since: iso(2026, 10, 3), until: new Date(now + 1).toISOString() })).toBe('until');
    expect(SummaryTarget.parse({ since: iso(2026, 10, 3), until: new Date(now).toISOString() }, now).ok).toBe(true);
    expect(failedField({ q: '京都', until: new Date(now + 1).toISOString() })).toBe('until');
  });

  it('期間は 7 日まで許し、since が until 以後なら不正にする', () => {
    expect(SummaryTarget.parse({ since: iso(2026, 9, 28, 3), until: iso(2026, 10, 4, 3) }, now).ok).toBe(true);
    expect(failedField({ since: iso(2026, 9, 28, 2, 59), until: iso(2026, 10, 4, 3) })).toBe('since');
    expect(failedField({ since: iso(2026, 10, 4), until: iso(2026, 10, 3) })).toBe('since');
    expect(failedField({ since: iso(2026, 10, 3), until: iso(2026, 10, 3) })).toBe('since');
  });

  it('オブジェクトでない本文は body の不正にする', () => {
    expect(failedField(undefined)).toBe('body');
    expect(failedField('q')).toBe('body');
    expect(failedField([])).toBe('body');
  });
});
