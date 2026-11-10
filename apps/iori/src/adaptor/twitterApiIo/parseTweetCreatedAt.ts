import { Instant } from '../../domain/instant/instant.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// 古典形式は Date.parse の実装依存に頼らず、桁と範囲を確かめて読む
const PATTERN = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})$/;

export const parseTweetCreatedAt = (value: string): Instant | undefined => {
  const match = PATTERN.exec(value);
  if (match === null) return undefined;
  const month = MONTHS.indexOf(match[1] as (typeof MONTHS)[number]);
  const [day, hour, minute, second, offsetHour, offsetMinute, year] = [2, 3, 4, 5, 7, 8, 9].map((index) =>
    Number(match[index])
  ) as [number, number, number, number, number, number, number];
  if (month < 0 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined;
  const local = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (local.getUTCMonth() !== month || local.getUTCDate() !== day) return undefined;
  const offsetMs = (match[6] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute) * 60_000;
  const instant = Instant.of(local.getTime() - offsetMs);
  return instant.ok ? instant.val : undefined;
};
