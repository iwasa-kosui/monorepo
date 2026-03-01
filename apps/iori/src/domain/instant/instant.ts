import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const InstantSym = Symbol('Instant');
const zodType = z.number().int().nonnegative().brand(InstantSym).describe('Instant');
const schema = Schema.create<z.output<typeof zodType>, number>(zodType);

/**
 * Instant は、1970年1月1日00:00:00 UTC からの経過ミリ秒数を表す整数です。
 */
export type Instant = z.output<typeof zodType>;

const now = (): Instant => Date.now() as Instant;
const addDuration = (instant: Instant, durationMs: number): Instant => (instant + durationMs) as Instant;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Instantを相対時間文字列にフォーマットする
 * @param instant フォーマット対象のInstant
 * @param locale ロケール（デフォルト: 'ja-JP'）
 * @returns 相対時間文字列（例: 「3分前」「2時間前」「昨日」）
 */
const formatRelative = (instant: Instant, locale: string = 'ja-JP'): string => {
  const nowMs = Date.now();
  const diff = nowMs - instant;

  // 未来の日時の場合は絶対時刻を表示
  if (diff < 0) {
    return new Date(instant).toLocaleDateString(locale);
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diff < MINUTE) {
    return rtf.format(0, 'second'); // "たった今" or "now"
  }
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return rtf.format(-minutes, 'minute');
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return rtf.format(-hours, 'hour');
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return rtf.format(-days, 'day');
  }

  // 7日以上前は日付を表示
  return new Date(instant).toLocaleDateString(locale);
};

export const Instant = {
  ...schema,
  now,
  addDuration,
  toDate: (instant: Instant): Date => new Date(instant),
  formatRelative,
} as const;
