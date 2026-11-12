import { formatClock } from '../schedule';

type TimedRow = { readonly id: string; readonly minutes: number };

export const elapsedMinutes = (
  rows: readonly TimedRow[],
  chapter: string,
  number: number,
  total: number,
): number => {
  const index = rows.findIndex((row) => row.id === chapter);
  const row = rows[index];
  if (row === undefined) {
    throw new Error(`schedule.ts に章がありません: ${chapter}`);
  }
  const start = rows.slice(0, index).reduce((sum, earlier) => sum + earlier.minutes, 0);
  const within = Math.min(Math.round(row.minutes * (number - 1) / total), Math.max(row.minutes - 1, 0));
  return start + within;
};

export const formatElapsed = (minutes: number): string => formatClock(minutes);

const plainHeading = (text: string): string =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const firstHeading = (body: string | undefined): string | undefined => {
  let fence: string | undefined;
  for (const line of (body ?? '').split('\n')) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker[0];
      else if (marker[0] === fence) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const text = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (text === undefined) continue;
    const heading = plainHeading(text);
    if (heading !== '') return heading;
  }
  return undefined;
};

export const pageLabel = (number: number, heading: string | undefined): string =>
  heading === undefined ? `${number} ページ目` : `${number} ${heading}`;
