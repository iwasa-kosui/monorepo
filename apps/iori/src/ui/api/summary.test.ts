import { afterEach, describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import {
  buildSummaryRequest,
  normalizeSummaryMarkdown,
  splitSummaryCitations,
  summaryErrorMessage,
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

describe('normalizeSummaryMarkdown', () => {
  it('wraps a heading in brackets and drops the # marks', () => {
    expect(normalizeSummaryMarkdown('# 猫')).toBe('【猫】');
    expect(normalizeSummaryMarkdown('### 旅行の話')).toBe('【旅行の話】');
    expect(normalizeSummaryMarkdown('###### 六つ')).toBe('【六つ】');
  });

  it('returns an empty line for a heading with no text after the # marks', () => {
    expect(normalizeSummaryMarkdown('# ')).toBe('');
    expect(normalizeSummaryMarkdown('### ')).toBe('');
  });

  it('keeps a heading that already starts with a bracket without wrapping it again', () => {
    expect(normalizeSummaryMarkdown('## 【猫】')).toBe('【猫】');
    expect(normalizeSummaryMarkdown('【猫】')).toBe('【猫】');
  });

  it('keeps a # that is not followed by a space or comes seven or more times', () => {
    expect(normalizeSummaryMarkdown('#猫')).toBe('#猫');
    expect(normalizeSummaryMarkdown('####### 七つ')).toBe('####### 七つ');
  });

  it('replaces a bullet marker of *, - and + with a middle dot', () => {
    expect(normalizeSummaryMarkdown('* 一つ目')).toBe('・一つ目');
    expect(normalizeSummaryMarkdown('- 二つ目')).toBe('・二つ目');
    expect(normalizeSummaryMarkdown('+ 三つ目')).toBe('・三つ目');
  });

  it('replaces an indented bullet marker together with the spaces before it', () => {
    expect(normalizeSummaryMarkdown('  * 入れ子')).toBe('・入れ子');
    expect(normalizeSummaryMarkdown('\t- 入れ子')).toBe('・入れ子');
  });

  it('removes ** from a line', () => {
    expect(normalizeSummaryMarkdown('これは**大事**です')).toBe('これは大事です');
    expect(normalizeSummaryMarkdown('* **強調** の項目')).toBe('・強調 の項目');
    expect(normalizeSummaryMarkdown('### **見出し**')).toBe('【見出し】');
  });

  it('keeps [n] in a line', () => {
    expect(normalizeSummaryMarkdown('- 猫が増えた[1][2]')).toBe('・猫が増えた[1][2]');
    expect(normalizeSummaryMarkdown('* 犬も[3, 4]')).toBe('・犬も[3, 4]');
  });

  it('keeps an ordinary line, a hyphen without a space and an empty line', () => {
    expect(normalizeSummaryMarkdown('ふつうの行です。')).toBe('ふつうの行です。');
    expect(normalizeSummaryMarkdown('-5度まで下がった')).toBe('-5度まで下がった');
    expect(normalizeSummaryMarkdown('・すでに点')).toBe('・すでに点');
    expect(normalizeSummaryMarkdown('')).toBe('');
  });

  it('converts each line of a multi-line summary', () => {
    expect(normalizeSummaryMarkdown('### 猫\n* 一つ目[1]\n\n- 二つ目[2]')).toBe('【猫】\n・一つ目[1]\n\n・二つ目[2]');
  });

  it('does not change HTML-like text', () => {
    expect(normalizeSummaryMarkdown('<b>太字</b> & <script>')).toBe('<b>太字</b> & <script>');
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

describe('summaryErrorMessage', () => {
  const now = new Date('2026-01-01T01:30:00Z');
  const limit = '今日の要約の回数（20 回）を使い切りました。';
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
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
});
