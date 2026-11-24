import { clockOf, padNumber } from './clock';
import type { LogEntry, LogExplorerConfig } from './scenario';

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type LogContext = Pick<LogExplorerConfig, 'client' | 'target'>;

export const describeLog = (entry: LogEntry, time: number, context: LogContext) => {
  const date = new Date(time);
  const stamp = `${months[date.getUTCMonth()] ?? ''} ${padNumber(date.getUTCDate())} ${clockOf(time)}.${
    padNumber(date.getUTCMilliseconds(), 3)
  }`;
  const content = `${entry.method} ${entry.path} ${entry.status} ${entry.duration}ms`;
  return {
    time,
    iso: date.toISOString(),
    date: stamp,
    content,
    text: `${stamp} ${content}`.toLowerCase(),
    level: entry.level.toLowerCase(),
    levelLabel: entry.level,
    method: entry.method,
    target: context.target !== undefined
      && entry.method === context.target.method
      && entry.path === context.target.path,
    attrs: [
      ['http.method', entry.method],
      ['http.url', entry.path],
      ['http.status_code', String(entry.status)],
      ['duration', String(entry.duration)],
      ['network.client.ip', context.client.ip],
      ['http.useragent', context.client.userAgent],
    ] as [string, string][],
  };
};

export type LogView = ReturnType<typeof describeLog>;
