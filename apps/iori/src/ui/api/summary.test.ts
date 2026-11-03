import { afterEach, describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import {
  buildSummaryRequest,
  splitSummaryCitations,
  summaryErrorMessage,
  summaryResultLabel,
  summaryTargetLabel,
} from './summary.ts';

const s1 = { id: 's1' } as Status;
const s3 = { id: 's3' } as Status;
const citations = [{ n: 1, status: s1 }, { n: 3, status: s3 }];

describe('splitSummaryCitations', () => {
  it('turns a single cited number into a link', () => {
    expect(splitSummaryCitations('猫がいた[1]。', citations)).toEqual([
      { type: 'text', text: '猫がいた[' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: ']。' },
    ]);
  });

  it('turns each cited number in a grouped form into a link', () => {
    expect(splitSummaryCitations('話題 [1, 3]', citations)).toEqual([
      { type: 'text', text: '話題 [' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: ', ' },
      { type: 'link', n: 3, status: s3 },
      { type: 'text', text: ']' },
    ]);
  });

  it('accepts the ideographic comma as a separator in a grouped form', () => {
    expect(splitSummaryCitations('話題 [1、3]', citations)).toEqual([
      { type: 'text', text: '話題 [' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: '、' },
      { type: 'link', n: 3, status: s3 },
      { type: 'text', text: ']' },
    ]);
  });

  it('keeps a number that is not in the citations as text', () => {
    expect(splitSummaryCitations('a [2] b [1, 2]', citations)).toEqual([
      { type: 'text', text: 'a [2] b [' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: ', 2]' },
    ]);
  });

  it('returns one text segment when the body has no number', () => {
    expect(splitSummaryCitations('番号なし [a] 1', citations)).toEqual([{ type: 'text', text: '番号なし [a] 1' }]);
    expect(splitSummaryCitations('', citations)).toEqual([]);
  });

  it('keeps [0] and a number too large to match as text', () => {
    expect(splitSummaryCitations('a[0]b', citations)).toEqual([{ type: 'text', text: 'a[0]b' }]);
    expect(splitSummaryCitations('a[99999999999999999999]b', citations)).toEqual([
      { type: 'text', text: 'a[99999999999999999999]b' },
    ]);
  });

  it('turns consecutive brackets into separate links', () => {
    expect(splitSummaryCitations('a[1][3]b', citations)).toEqual([
      { type: 'text', text: 'a[' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: '][' },
      { type: 'link', n: 3, status: s3 },
      { type: 'text', text: ']b' },
    ]);
  });

  it('links the inner bracket of a nested form and keeps the outer brackets as text', () => {
    expect(splitSummaryCitations('a[[1]]b', citations)).toEqual([
      { type: 'text', text: 'a[[' },
      { type: 'link', n: 1, status: s1 },
      { type: 'text', text: ']]b' },
    ]);
  });

  it('keeps an unclosed bracket as text', () => {
    expect(splitSummaryCitations('a[1,3', citations)).toEqual([{ type: 'text', text: 'a[1,3' }]);
  });

  it('keeps line breaks in the text', () => {
    expect(splitSummaryCitations('一行目\n二行目[1]', citations)[0]).toEqual({
      type: 'text',
      text: '一行目\n二行目[',
    });
  });
});

describe('buildSummaryRequest', () => {
  const since = '2026-01-01T09:00';
  const until = '2026-01-02T09:00';
  const sinceIso = '2026-01-01T00:00:00.000Z';
  const untilIso = '2026-01-02T00:00:00.000Z';
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('builds a search summary with q only', () => {
    expect(buildSummaryRequest({ query: ' 猫 ', since: '', until: '' })).toEqual({ ok: true, body: { q: '猫' } });
  });

  it('builds a search summary with q and the period', () => {
    expect(buildSummaryRequest({ query: '猫', since, until })).toEqual({
      ok: true,
      body: { q: '猫', since: sinceIso, until: untilIso },
    });
  });

  it('builds a period summary without q', () => {
    expect(buildSummaryRequest({ query: '  ', since, until })).toEqual({
      ok: true,
      body: { since: sinceIso, until: untilIso },
    });
  });

  it('asks for both ends of the period when q is empty and one end is missing', () => {
    for (const input of [{ since, until: '' }, { since: '', until }, { since: '', until: '' }]) {
      const result = buildSummaryRequest({ query: '', ...input });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain('両方');
    }
  });

  it('reads the period as Japan time whatever the time zone of the browser', () => {
    for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect(buildSummaryRequest({ query: '猫', since, until })).toEqual({
        ok: true,
        body: { q: '猫', since: sinceIso, until: untilIso },
      });
    }
  });

  it('reads a value with seconds as Japan time', () => {
    expect(buildSummaryRequest({ query: '猫', since: '2026-01-01T09:00:30', until: '' })).toEqual({
      ok: true,
      body: { q: '猫', since: '2026-01-01T00:00:30.000Z' },
    });
  });

  it('rejects a date that cannot be read', () => {
    expect(buildSummaryRequest({ query: '猫', since: 'not a date', until: '' }).ok).toBe(false);
  });
});

describe('summaryTargetLabel', () => {
  it('names the search term when there is a searched query', () => {
    expect(summaryTargetLabel('猫')).toBe('検索語『猫』の結果を要約します');
  });

  it('names the period when the searched query is empty', () => {
    expect(summaryTargetLabel('')).toBe('開始から終了までの期間を要約します');
    expect(summaryTargetLabel('  ')).toBe('開始から終了までの期間を要約します');
  });
});

describe('summaryResultLabel', () => {
  it('names the search term when the target is not empty', () => {
    expect(summaryResultLabel('猫')).toBe('検索語『猫』の結果の要約です');
  });

  it('names the period when the target is empty', () => {
    expect(summaryResultLabel('')).toBe('期間の要約です');
  });
});

describe('summaryErrorMessage', () => {
  const now = new Date('2026-01-01T01:30:00Z');
  const limit = '今日の要約の回数（20 回）を使い切りました。';
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('explains a 422', () => {
    expect(summaryErrorMessage(422, undefined, now)).toBe(
      '入力を確かめてください（検索語は 200 文字まで、期間は 7 日以内、終了は現在より前）',
    );
  });

  it('shows the date and time the quota comes back on a 429 in Japan time', () => {
    expect(summaryErrorMessage(429, 3600, now)).toBe(`${limit}1/1 11:30 から使えます。`);
    expect(summaryErrorMessage(429, 9 * 3600 + 30 * 60, now)).toBe(`${limit}1/1 20:00 から使えます。`);
    expect(summaryErrorMessage(429, 14 * 3600, now)).toBe(`${limit}1/2 00:30 から使えます。`);
  });

  it('shows Japan time whatever the time zone of the browser', () => {
    for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect(summaryErrorMessage(429, 3600, now)).toBe(`${limit}1/1 11:30 から使えます。`);
    }
  });

  it('omits the time on a 429 without Retry-After', () => {
    expect(summaryErrorMessage(429, undefined, now)).toBe(limit);
  });

  it('omits the time on a 429 when the time is out of the range of a date', () => {
    expect(summaryErrorMessage(429, 1e20, now)).toBe(limit);
    expect(summaryErrorMessage(429, Number.POSITIVE_INFINITY, now)).toBe(limit);
  });

  it('explains a 502', () => {
    expect(summaryErrorMessage(502, undefined, now)).toBe('要約を作れませんでした。時間をおいて試してください。');
  });

  it('falls back to a generic message', () => {
    expect(summaryErrorMessage(500, undefined, now)).toBe('要約に失敗しました。時間をおいて試してください。');
    expect(summaryErrorMessage(undefined, undefined, now)).toBe('要約に失敗しました。時間をおいて試してください。');
  });
});
