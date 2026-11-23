import { inspect } from './inspect.ts';
import { maxLogChars, maxLogLineChars, maxLogLines, truncate } from './limits.ts';
import type { LogLine, LogSummary } from './types.ts';

const isFullWidth = (code: number): boolean =>
  code >= 0x1100
  && (code <= 0x115f
    || code === 0x2329
    || code === 0x232a
    || (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f)
    || (code >= 0x3250 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0xa4c6)
    || (code >= 0xa960 && code <= 0xa97c)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19)
    || (code >= 0xfe30 && code <= 0xfe6b)
    || (code >= 0xff01 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x1b000 && code <= 0x1b001)
    || (code >= 0x1f200 && code <= 0x1f251)
    || (code >= 0x1f300 && code <= 0x1f64f)
    || (code >= 0x1f900 && code <= 0x1f9ff)
    || (code >= 0x20000 && code <= 0x3fffd));

const isZeroWidth = (code: number): boolean =>
  code <= 0x1f
  || (code >= 0x7f && code <= 0x9f)
  || (code >= 0x300 && code <= 0x36f)
  || (code >= 0x200b && code <= 0x200f)
  || (code >= 0x20d0 && code <= 0x20ff)
  || (code >= 0xfe00 && code <= 0xfe0f)
  || (code >= 0xfe20 && code <= 0xfe2f);

export const stringWidth = (text: string): number => {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidth(code)) {
      continue;
    }
    width += isFullWidth(code) ? 2 : 1;
  }
  return width;
};

const renderRow = (row: readonly string[], widths: readonly number[]): string => {
  const cells = row.map((cell, index) => `${cell}${' '.repeat((widths[index] ?? 0) - stringWidth(cell))}`);
  return `│ ${cells.join(' │ ')} │`;
};

const renderTable = (head: readonly string[], columns: readonly (readonly (string | undefined)[])[]): string => {
  const widths = head.map((title) => stringWidth(title));
  const longest = Math.max(...columns.map((column) => column.length));
  const rows: string[][] = [];
  head.forEach((_, columnIndex) => {
    const column = columns[columnIndex] ?? [];
    for (let rowIndex = 0; rowIndex < longest; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      rows[rowIndex] = row;
      const value = column[rowIndex] ?? '';
      row[columnIndex] = value;
      widths[columnIndex] = Math.max(widths[columnIndex] ?? 0, stringWidth(value));
    }
  });
  const divider = widths.map((width) => '─'.repeat(width + 2));
  return [
    `┌${divider.join('┬')}┐`,
    renderRow(head, widths),
    `├${divider.join('┼')}┤`,
    ...rows.map((row) => renderRow(row, widths)),
    `└${divider.join('┴')}┘`,
  ].join('\n');
};

const inspectCell = (value: unknown): string => {
  const isPlainObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const depth = isPlainObject && Object.keys(value).length > 2 ? -1 : 0;
  return inspect(value, { depth, maxArrayLength: 3, breakLength: Infinity });
};

export const formatTable = (data: unknown, properties?: readonly string[]): string | undefined => {
  if (data === null || typeof data !== 'object') {
    return undefined;
  }
  const map = new Map<string, (string | undefined)[]>();
  const valuesColumn: (string | undefined)[] = [];
  let hasPrimitives = false;
  const indexKeys = Object.keys(data);
  indexKeys.forEach((indexKey, index) => {
    const item = (data as Record<string, unknown>)[indexKey];
    const isPrimitive = item === null || (typeof item !== 'function' && typeof item !== 'object');
    if (properties === undefined && isPrimitive) {
      hasPrimitives = true;
      valuesColumn[index] = inspectCell(item);
      return;
    }
    const keys = properties ?? Object.keys(item as object);
    for (const key of keys) {
      const column = map.get(key) ?? [];
      map.set(key, column);
      column[index] = isPrimitive || !Object.prototype.hasOwnProperty.call(item, key)
        ? ''
        : inspectCell((item as Record<string, unknown>)[key]);
    }
  });
  const head = ['(index)', ...map.keys(), ...(hasPrimitives ? ['Values'] : [])];
  const columns = [indexKeys, ...map.values(), ...(hasPrimitives ? [valuesColumn] : [])];
  return renderTable(head, columns);
};

const formatDirective = (directive: string, argument: unknown): string => {
  switch (directive) {
    case 's':
      if (typeof argument === 'bigint') {
        return `${argument}n`;
      }
      if (typeof argument === 'object' && argument !== null) {
        return inspect(argument, { depth: 0 });
      }
      return typeof argument === 'symbol' ? argument.toString() : String(argument);
    case 'd':
      return typeof argument === 'bigint'
        ? `${argument}n`
        : typeof argument === 'object' && argument !== null
        ? 'NaN'
        : String(Number(argument));
    case 'i':
      return typeof argument === 'bigint'
        ? `${argument}n`
        : typeof argument === 'object' && argument !== null
        ? 'NaN'
        : String(Number.parseInt(String(argument), 10));
    case 'f':
      return typeof argument === 'symbol' ? 'NaN' : String(Number.parseFloat(String(argument)));
    case 'j':
      try {
        return JSON.stringify(argument) ?? 'undefined';
      } catch {
        return '[Circular]';
      }
    case 'o':
      return inspect(argument, { depth: 4 });
    case 'O':
      return inspect(argument);
    default:
      return '';
  }
};

export const formatLog = (args: readonly unknown[]): string => {
  const [first, ...rest] = args;
  let text = '';
  let remaining: readonly unknown[] = args;
  if (typeof first === 'string') {
    remaining = rest;
    text = first.replace(/%([sdifjoOc%])/g, (match, directive: string) => {
      if (directive === '%') {
        return '%';
      }
      if (remaining.length === 0) {
        return match;
      }
      const [argument, ...others] = remaining;
      remaining = others;
      return directive === 'c' ? '' : formatDirective(directive, argument);
    });
    if (remaining.length > 0) {
      text += ' ';
    }
  }
  return text + remaining.map((value) => (typeof value === 'string' ? value : inspect(value))).join(' ');
};

export type RunConsole = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  dir: (value: unknown) => void;
  table: (data: unknown, properties?: readonly string[]) => void;
  assert: (condition: unknown, ...args: unknown[]) => void;
  group: (...args: unknown[]) => void;
  groupCollapsed: (...args: unknown[]) => void;
  groupEnd: () => void;
};

export const createConsole = (): { console: RunConsole; lines: LogLine[]; summary: () => LogSummary } => {
  const lines: LogLine[] = [];
  let indent = '';
  let totalLines = 0;
  let totalChars = 0;
  let cutLines = 0;
  const write = (stream: LogLine['stream'], format: () => string): void => {
    totalLines += 1;
    if (lines.length >= maxLogLines || totalChars >= maxLogChars) {
      return;
    }
    const text = format();
    if (text.length > maxLogLineChars) {
      cutLines += 1;
    }
    const body = truncate(text, maxLogLineChars);
    const indented = indent === '' ? body : body.split('\n').map((line) => `${indent}${line}`).join('\n');
    totalChars += indented.length;
    lines.push({ stream, text: indented });
  };
  const toStdout = (...args: unknown[]): void => write('stdout', () => formatLog(args));
  const toStderr = (...args: unknown[]): void => write('stderr', () => formatLog(args));
  const group = (...args: unknown[]): void => {
    if (args.length > 0) {
      toStdout(...args);
    }
    indent += '  ';
  };
  const runConsole: RunConsole = {
    log: toStdout,
    info: toStdout,
    debug: toStdout,
    error: toStderr,
    warn: toStderr,
    trace: (...args) => write('stderr', () => `Trace: ${formatLog(args)}`),
    dir: (value) => write('stdout', () => inspect(value)),
    table: (data, properties) => {
      write('stdout', () => formatTable(data, properties) ?? formatLog([data]));
    },
    assert: (condition, ...args) => {
      if (!condition) {
        write('stderr', () => args.length === 0 ? 'Assertion failed' : `Assertion failed: ${formatLog(args)}`);
      }
    },
    group,
    groupCollapsed: group,
    groupEnd: () => {
      indent = indent.slice(2);
    },
  };
  return {
    console: runConsole,
    lines,
    summary: () => ({ totalLines, shownLines: lines.length, cutLines }),
  };
};
