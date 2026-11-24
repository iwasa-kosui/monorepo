import { describe, expect, it } from 'vitest';

import { describeLog } from './log-format';
import { chartOf, matchesToken, minuteMs, rowsMatchingFacets, rowsMatchingQuery } from './log-search';

const context = {
  client: { ip: '10.0.0.1', userAgent: 'agent' },
  target: { method: 'POST', path: '/cancel' },
} as const;
const scope = { service: 'api', host: 'api-1' };

const rowOf = (level: 'INFO' | 'WARN', method: 'GET' | 'POST', path: string, time: number) => {
  const view = describeLog({ level, method, path, status: level === 'WARN' ? 404 : 200, duration: 5 }, time, context);
  return { ...view, attrs: new Map(view.attrs) };
};

const base = Date.UTC(2026, 10, 6, 18, 0, 0);
const rows = [
  rowOf('INFO', 'GET', '/visits', base),
  rowOf('WARN', 'GET', '/visits/none', base + minuteMs),
  rowOf('INFO', 'POST', '/cancel', base + minuteMs),
];

describe('ログの検索', () => {
  it('対象の操作のログだけを target として見分ける', () => {
    expect(rows.map((row) => row.target)).toEqual([false, false, true]);
  });

  it('自由な文字列と key:value で絞り込み、空白区切りは AND になる', () => {
    expect(rowsMatchingQuery(rows, 'service:api', scope)).toHaveLength(3);
    expect(rowsMatchingQuery(rows, 'service:other', scope)).toHaveLength(0);
    expect(rowsMatchingQuery(rows, 'status:warn', scope)).toHaveLength(1);
    expect(rowsMatchingQuery(rows, '@http.method:post', scope)).toHaveLength(1);
    expect(rowsMatchingQuery(rows, 'service:api visits', scope)).toHaveLength(2);
    expect(rowsMatchingQuery(rows, 'service:api visits none', scope)).toHaveLength(1);
  });

  it('属性の名前が未知の key:value は、文字列として探す', () => {
    expect(matchesToken(rows[0]!, 'nothing:here', scope)).toBe(false);
  });

  it('ファセットは、同じ項目では OR、別の項目とは AND で絞り込む', () => {
    const checked = new Map([['status', new Set(['info'])], ['method', new Set(['POST'])]]);
    expect(rowsMatchingFacets(rows, checked, scope)).toHaveLength(1);
    expect(rowsMatchingFacets(rows, new Map([['status', new Set(['info', 'warn'])]]), scope)).toHaveLength(3);
  });

  it('グラフは、1 分ごとの件数から高さと Warn の印と説明の文を作る', () => {
    const chart = chartOf(rows, base, 3);
    expect(chart.heights).toEqual(['50%', '100%', '0%']);
    expect(chart.warns).toEqual([false, true, false]);
    expect(chart.label).toBe('1分ごとのログ件数。合計 3 件。最も多いのは 18:01 の 2 件。Warn を含む時間帯は 18:01。');
    expect(chartOf([], base, 3).label).toBe('1分ごとのログ件数。表示中のログはありません。');
  });
});
