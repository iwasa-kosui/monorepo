import { minuteOf } from './clock';

export const minuteMs = 60_000;

export type SearchRow = {
  readonly level: string;
  readonly method: string;
  readonly time: number;
  readonly text: string;
  readonly attrs: ReadonlyMap<string, string>;
};

export type SearchScope = { readonly service: string; readonly host: string };

export const facetValue = (row: SearchRow, facet: string, scope: SearchScope): string =>
  facet === 'status' ? row.level : facet === 'method' ? row.method : scope.service;

export const matchesToken = (row: SearchRow, token: string, scope: SearchScope): boolean => {
  const pair = /^(@?[\w.]+):(.+)$/.exec(token);
  if (pair !== null) {
    const key = pair[1] ?? '';
    const value = (pair[2] ?? '').toLowerCase();
    if (key === 'service') return value === scope.service;
    if (key === 'host') return value === scope.host;
    if (key === 'status') return row.level === value;
    if (key.startsWith('@')) {
      const attr = row.attrs.get(key.slice(1));
      if (attr !== undefined) return attr.toLowerCase() === value;
    }
  }
  return row.text.includes(token.toLowerCase());
};

export const rowsMatchingQuery = <T extends SearchRow>(rows: readonly T[], query: string, scope: SearchScope): T[] => {
  const tokens = query.split(/\s+/).filter((token) => token !== '');
  return rows.filter((row) => tokens.every((token) => matchesToken(row, token, scope)));
};

export const rowsMatchingFacets = <T extends SearchRow>(
  rows: readonly T[],
  checked: ReadonlyMap<string, ReadonlySet<string>>,
  scope: SearchScope,
): T[] => rows.filter((row) => [...checked].every(([facet, values]) => values.has(facetValue(row, facet, scope))));

export type Chart = {
  readonly heights: readonly string[];
  readonly warns: readonly boolean[];
  readonly label: string;
};

export const chartOf = (shown: readonly SearchRow[], firstBar: number, barCount: number): Chart => {
  const counts = Array.from(
    { length: barCount },
    (_, index) => shown.filter((row) => Math.floor((row.time - firstBar) / minuteMs) === index),
  );
  const peak = Math.max(...counts.map((list) => list.length));
  const heights = counts.map((list) =>
    list.length === 0 ? '0%' : `${Math.max(8, Math.round(list.length / peak * 100))}%`
  );
  const warns = counts.map((list) => list.some((row) => row.level === 'warn'));
  const total = counts.reduce((sum, list) => sum + list.length, 0);
  const warnMinutes = counts.flatMap((list, index) =>
    list.some((row) => row.level === 'warn') ? [minuteOf(firstBar + index * minuteMs)] : []
  );
  const peakIndex = counts.findIndex((list) => list.length === peak);
  const label = total === 0
    ? '1分ごとのログ件数。表示中のログはありません。'
    : `1分ごとのログ件数。合計 ${total} 件。最も多いのは ${minuteOf(firstBar + peakIndex * minuteMs)} の ${peak} 件。${
      warnMinutes.length === 0
        ? 'Warn を含む時間帯はありません。'
        : `Warn を含む時間帯は ${warnMinutes.join('、')}。`
    }`;
  return { heights, warns, label };
};
