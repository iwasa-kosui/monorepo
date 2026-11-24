const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

export const clockOf = (time: number): string => {
  const date = new Date(time);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

export const minuteOf = (time: number): string => clockOf(time).slice(0, 5);

export const formatElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

export const padNumber = pad;
