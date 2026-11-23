import { logClient, type LogEntry } from './incident-scenario';

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

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

export const clockOf = (time: number): string => {
  const date = new Date(time);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

export const minuteOf = (time: number): string => clockOf(time).slice(0, 5);

export const describeLog = (entry: LogEntry, time: number) => {
  const date = new Date(time);
  const stamp = `${months[date.getUTCMonth()] ?? ''} ${pad(date.getUTCDate())} ${clockOf(time)}.${
    pad(date.getUTCMilliseconds(), 3)
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
    cancel: entry.method === 'POST'
      && entry.path === '/visits/visit-pochi/cancel',
    attrs: [
      ['http.method', entry.method],
      ['http.url', entry.path],
      ['http.status_code', String(entry.status)],
      ['duration', String(entry.duration)],
      ['network.client.ip', logClient.ip],
      ['http.useragent', logClient.userAgent],
    ] as [string, string][],
  };
};

export type LogView = ReturnType<typeof describeLog>;
