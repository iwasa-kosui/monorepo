import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import {
  formatSummaryHeading,
  readSourceNumbers,
  type SummaryItem,
  toSummaryDocuments,
  truncateSummaryItems,
} from '../summaryItems.ts';

const item = (text: string, createdAt: number, username = 'alice'): SummaryItem => ({
  postId: PostId.generate(),
  username,
  createdAt: Instant.orThrow(createdAt),
  text,
});

describe('truncateSummaryItems', () => {
  it('合計が上限以下なら何も外さない', () => {
    const items = [item('aaaa', 3), item('bbbb', 2)];

    const result = truncateSummaryItems(items, 'fromEnd', 8);

    expect(result).toEqual({ items, truncated: false });
  });

  it('fromEnd は後ろの投稿から外す', () => {
    const [first, second, third] = [item('aaaa', 1), item('bbbb', 2), item('cccc', 3)] as const;

    const result = truncateSummaryItems([first, second, third], 'fromEnd', 8);

    expect(result.items).toEqual([first, second]);
    expect(result.truncated).toBe(true);
  });

  it('fromEnd は途中で上限を超えた投稿より後ろに短い投稿があっても外す', () => {
    const [first, long, short] = [item('aaaa', 1), item('bbbbbbbb', 2), item('c', 3)] as const;

    const result = truncateSummaryItems([first, long, short], 'fromEnd', 8);

    expect(result.items).toEqual([first]);
  });

  it('oldestFirst は古い投稿から外し、残りは渡された順のままにする', () => {
    const newest = item('aaaa', 30);
    const middle = item('bbbb', 20);
    const oldest = item('cccc', 10);

    const result = truncateSummaryItems([middle, oldest, newest], 'oldestFirst', 8);

    expect(result.items).toEqual([middle, newest]);
    expect(result.truncated).toBe(true);
  });

  it('文字数は UTF-16 ではなく文字で数える', () => {
    const items = [item('😀😀😀😀', 1)];

    expect(truncateSummaryItems(items, 'fromEnd', 4).truncated).toBe(false);
    expect(truncateSummaryItems(items, 'fromEnd', 3).items).toEqual([]);
  });

  it('既定の上限は 20,000 文字', () => {
    const fits = item('あ'.repeat(20_000), 2);
    const over = item('い', 1);

    expect(truncateSummaryItems([fits], 'fromEnd').truncated).toBe(false);
    expect(truncateSummaryItems([fits, over], 'fromEnd')).toEqual({ items: [fits], truncated: true });
  });
});

describe('formatSummaryHeading', () => {
  it('作者と日本時間の日時を見出しにする', () => {
    const heading = formatSummaryHeading(3, item('x', Date.UTC(2026, 10, 4, 15, 5), 'bob'));

    expect(heading).toBe('[3] @bob 2026-11-05 00:05（JST）');
  });
});

describe('toSummaryDocuments', () => {
  it('1 から始まる番号の見出しと本文を組にする', () => {
    const documents = toSummaryDocuments([
      item('一つ目', Date.UTC(2026, 10, 4, 0, 0)),
      item('二つ目', Date.UTC(2026, 10, 4, 1, 30), 'bob'),
    ]);

    expect(documents).toEqual([
      '[1] @alice 2026-11-04 09:00（JST）\n一つ目',
      '[2] @bob 2026-11-04 10:30（JST）\n二つ目',
    ]);
  });
});

describe('readSourceNumbers', () => {
  it('出力の [n] を昇順で重複なく返す', () => {
    expect(readSourceNumbers('- 話題A [3]\n- 話題B [1][3]\n- 話題C [2]', 3)).toEqual([1, 2, 3]);
  });

  it('渡していない番号と 0 は捨てる', () => {
    expect(readSourceNumbers('[0] [4] [99] [2]', 3)).toEqual([2]);
  });

  it('カンマ区切りの番号も読む', () => {
    expect(readSourceNumbers('話題 [1, 3] [2、5]', 4)).toEqual([1, 2, 3]);
  });

  it('番号がなければ空の配列を返す', () => {
    expect(readSourceNumbers('出典なし [a] []', 3)).toEqual([]);
  });
});
