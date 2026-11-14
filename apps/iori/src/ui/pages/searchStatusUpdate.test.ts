import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { SearchStatusesResult, TimelineSummary } from '../api/mastodonClient.ts';
import { type SearchSummary, updateSearchedStatuses, updateSummaryCitations } from './searchStatusUpdate.ts';

const post = (id: string, reblog: Status | null = null) => ({ id, reblog }) as unknown as Status;
const favourited = (status: Status): Status => ({ ...status, favourited: true });

const searched = (statuses: readonly Status[]) =>
  ({
    statuses: [...statuses],
    terms: { original: ['a'], expanded: [] },
    dropped_original: [],
    expansion: 'ok',
  }) as unknown as SearchStatusesResult;

const summaryOf = (statuses: readonly Status[]): SearchSummary => ({
  target: 'a',
  result: {
    summary: '要約',
    citations: statuses.map((status, index) => ({ n: index + 1, status })),
    remaining_today: 3,
  } as unknown as TimelineSummary,
});

describe('updateSearchedStatuses', () => {
  it('id が一致する検索結果だけに updater を適用し、ほかの項目は残す', () => {
    const result = updateSearchedStatuses(searched([post('p1'), post('p2')]), 'p2', favourited);

    expect(result?.statuses).toEqual([post('p1'), { ...post('p2'), favourited: true }]);
    expect(result?.terms).toEqual({ original: ['a'], expanded: [] });
    expect(result?.expansion).toBe('ok');
  });
});

describe('updateSummaryCitations', () => {
  it('id が一致する引用だけに updater を適用し、番号とほかの項目は残す', () => {
    const result = updateSummaryCitations(summaryOf([post('p1'), post('p2')]), 'p1', favourited);

    expect(result?.result.citations).toEqual([
      { n: 1, status: { ...post('p1'), favourited: true } },
      { n: 2, status: post('p2') },
    ]);
    expect(result?.result.summary).toBe('要約');
    expect(result?.result.remaining_today).toBe(3);
    expect(result?.target).toBe('a');
  });
});
