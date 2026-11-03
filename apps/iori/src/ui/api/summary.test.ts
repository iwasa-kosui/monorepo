import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { buildSummaryRequest, splitSummaryCitations, summaryErrorMessage } from './summary.ts';

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
  const iso = (value: string) => new Date(value).toISOString();

  it('builds a search summary with q only', () => {
    expect(buildSummaryRequest({ query: ' 猫 ', since: '', until: '' })).toEqual({ ok: true, body: { q: '猫' } });
  });

  it('builds a search summary with q and the period', () => {
    expect(buildSummaryRequest({ query: '猫', since, until })).toEqual({
      ok: true,
      body: { q: '猫', since: iso(since), until: iso(until) },
    });
  });

  it('builds a period summary without q', () => {
    expect(buildSummaryRequest({ query: '  ', since, until })).toEqual({
      ok: true,
      body: { since: iso(since), until: iso(until) },
    });
  });

  it('asks for both ends of the period when q is empty and one end is missing', () => {
    for (const input of [{ since, until: '' }, { since: '', until }, { since: '', until: '' }]) {
      const result = buildSummaryRequest({ query: '', ...input });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toContain('両方');
    }
  });

  it('rejects a date that cannot be read', () => {
    expect(buildSummaryRequest({ query: '猫', since: 'not a date', until: '' }).ok).toBe(false);
  });
});

describe('summaryErrorMessage', () => {
  const now = new Date(2026, 0, 1, 10, 30, 0);

  it('explains a 422', () => {
    expect(summaryErrorMessage(422, undefined, now)).toBe(
      '入力を確かめてください（期間は 7 日以内、終了は現在より前）',
    );
  });

  it('shows the time the quota comes back on a 429', () => {
    expect(summaryErrorMessage(429, 3600, now)).toBe('今日の要約の回数（20 回）を使い切りました。11:30 から使えます。');
    expect(summaryErrorMessage(429, 9 * 3600 + 30 * 60, now)).toBe(
      '今日の要約の回数（20 回）を使い切りました。20:00 から使えます。',
    );
  });

  it('omits the time on a 429 without Retry-After', () => {
    expect(summaryErrorMessage(429, undefined, now)).toBe('今日の要約の回数（20 回）を使い切りました。');
  });

  it('explains a 502', () => {
    expect(summaryErrorMessage(502, undefined, now)).toBe('要約を作れませんでした。時間をおいて試してください。');
  });

  it('falls back to a generic message', () => {
    expect(summaryErrorMessage(500, undefined, now)).toBe('要約に失敗しました。時間をおいて試してください。');
    expect(summaryErrorMessage(undefined, undefined, now)).toBe('要約に失敗しました。時間をおいて試してください。');
  });
});
