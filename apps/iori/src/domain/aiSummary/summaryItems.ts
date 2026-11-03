import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';
import { JST_OFFSET_MS } from './jst.ts';

export const MAX_SUMMARY_INPUT_CHARS = 20_000;

export type SummaryItem = Readonly<{
  postId: PostId;
  username: string;
  createdAt: Instant;
  text: string;
}>;

export type SummaryDropOrder = 'fromEnd' | 'oldestFirst';

export type TruncatedSummaryItems = Readonly<{
  items: ReadonlyArray<SummaryItem>;
  truncated: boolean;
}>;

const charCount = (item: SummaryItem): number => Array.from(item.text).length;

export const truncateSummaryItems = (
  items: ReadonlyArray<SummaryItem>,
  dropOrder: SummaryDropOrder,
  maxChars: number = MAX_SUMMARY_INPUT_CHARS,
): TruncatedSummaryItems => {
  const keepOrder = dropOrder === 'fromEnd'
    ? [...items]
    : [...items].sort((a, b) => b.createdAt - a.createdAt);
  const kept = new Set<SummaryItem>();
  let total = 0;
  for (const item of keepOrder) {
    total += charCount(item);
    if (total > maxChars) break;
    kept.add(item);
  }
  return { items: items.filter((item) => kept.has(item)), truncated: kept.size < items.length };
};

export const formatSummaryHeading = (index: number, item: SummaryItem): string => {
  const jst = new Date(item.createdAt + JST_OFFSET_MS).toISOString();
  return `[${index}] @${item.username} ${jst.slice(0, 10)} ${jst.slice(11, 16)}（JST）`;
};

export const toSummaryDocuments = (items: ReadonlyArray<SummaryItem>): string[] =>
  items.map((item, index) => `${formatSummaryHeading(index + 1, item)}\n${item.text}`);

export const readSourceNumbers = (output: string, documentCount: number): number[] => {
  const numbers = new Set<number>();
  for (const match of output.matchAll(/\[(\d+(?:\s*[,、]\s*\d+)*)\]/g)) {
    for (const value of match[1]!.split(/[,、]/)) {
      const number = Number(value.trim());
      if (number >= 1 && number <= documentCount) numbers.add(number);
    }
  }
  return [...numbers].sort((a, b) => a - b);
};
