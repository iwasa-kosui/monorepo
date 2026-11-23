import type { Database } from 'sql.js';

export const maxLogLines = 1000;
export const maxLogChars = 100_000;
export const maxLogLineChars = 10_000;
export const maxSqlCellChars = 1000;
export const maxMessageChars = 2000;
export const maxBlobBytes = 1_000_000;

export const truncate = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}…`;

export const limitBlobFunctions = (database: Database): void => {
  const guard = (size: unknown): number => {
    const bytes = Number(size);
    if (bytes > maxBlobBytes) {
      throw new Error('string or blob too big');
    }
    return Math.max(0, Math.trunc(bytes) || 0);
  };
  database.create_function('zeroblob', (size: unknown) => new Uint8Array(guard(size)));
  database.create_function('randomblob', (size: unknown) => {
    const bytes = new Uint8Array(guard(size));
    for (let offset = 0; offset < bytes.length; offset += 65_536) {
      crypto.getRandomValues(bytes.subarray(offset, offset + 65_536));
    }
    return bytes;
  });
};
