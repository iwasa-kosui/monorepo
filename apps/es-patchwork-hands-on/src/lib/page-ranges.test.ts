import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { chapterNames, readChapterText } from './chapter-files';
import { sliceLines } from './extract';
import { cancelVisitOf, insertTemplate, readFunctionsOf, whoCancelledQuery } from './snapshots';

type Range = { readonly from: number; readonly to: number };

const rangesByKey = (text: string, pattern: RegExp): Map<string, Range[]> => {
  const groups = new Map<string, Range[]>();
  for (const match of text.matchAll(pattern)) {
    const [, key = '', from = '', to = ''] = match;
    groups.set(key, [...(groups.get(key) ?? []), { from: Number(from), to: Number(to) }]);
  }
  return groups;
};

const expectCovers = (ranges: readonly Range[], total: number): void => {
  expect(ranges[0]?.from).toBe(1);
  ranges.slice(1).forEach((range, index) => {
    expect(range.from).toBe((ranges[index]?.to ?? 0) + 1);
  });
  expect(ranges.at(-1)?.to).toBe(total);
};

const codeOf = (expression: string): string => {
  const args = [...expression.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? '');
  if (expression.startsWith('cancelVisitOf(')) return cancelVisitOf(args[0] ?? '');
  if (expression.startsWith('readFunctionsOf(')) return readFunctionsOf(args[0] ?? '', args[1] ?? '');
  if (expression.startsWith('insertTemplate(')) return insertTemplate();
  if (expression.startsWith('whoCancelledQuery(')) return whoCancelledQuery();
  throw new Error(`コードの式を評価できません: ${expression}`);
};

const decisionTableRowCount = (heading: string): number => {
  const source = readFileSync(new URL('../../exercises/chapter-4-decision-table.md', import.meta.url), 'utf8');
  const section = source.split(/^## /m).find((part) => part.startsWith(`${heading}\n`));
  if (section === undefined) throw new Error(`判断表の節がありません: ${heading}`);
  return section.split('\n').filter((line) => line.startsWith('|')).length - 2;
};

describe('CodeBlock の行の範囲', () => {
  const groups = chapterNames().flatMap((chapter) => [
    ...rangesByKey(
      readChapterText(chapter),
      /<CodeBlock code=\{(.+?)\} from=\{(\d+)\} to=\{(\d+)\} \/>/g,
    ),
  ]);

  it('範囲つきのコードが使われている', () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  it('ページを順につなぐと、抜けも重複も無く元のコードと一致する', () => {
    for (const [expression, ranges] of groups) {
      const code = codeOf(expression);
      expectCovers(ranges, code.split('\n').length);
      expect(ranges.map((range) => sliceLines(code, range.from, range.to)).join('\n')).toBe(code);
    }
  });
});

describe('判断表の行の範囲', () => {
  const groups = chapterNames().flatMap((chapter) => [
    ...rangesByKey(
      readChapterText(chapter),
      /<DecisionTable heading="([^"]+)" from=\{(\d+)\} to=\{(\d+)\} \/>/g,
    ),
  ]);

  it('範囲つきの判断表が使われている', () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  it('ページを順につなぐと、抜けも重複も無く元の表の全行になる', () => {
    for (const [heading, ranges] of groups) {
      expectCovers(ranges, decisionTableRowCount(heading));
    }
  });
});
