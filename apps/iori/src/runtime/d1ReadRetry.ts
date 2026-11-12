import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export type D1ReadRetryOptions = Readonly<{
  maxAttempts?: number;
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}>;

const transientD1ErrorMessages: readonly string[] = [
  'Network connection lost',
  'storage caused object to be reset',
  'reset because its code was updated',
  'Cannot resolve D1 DB due to transient issue',
  'Replica disconnected from primary',
];

const defaultMaxAttempts = 3;
const defaultDelaysMs: readonly number[] = [50, 150];
const warnMessageLength = 200;

const messageOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return '';
  const message: unknown = Reflect.get(value, 'message');
  return typeof message === 'string' ? message : '';
};

export const isTransientD1Error = (error: unknown): boolean => {
  const cause: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'cause') : undefined;
  const messages = [messageOf(error), messageOf(cause)];
  return messages.some((message) => transientD1ErrorMessages.some((known) => message.includes(known)));
};

const leadingNoise = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/;

const isReadSql = (sql: string): boolean => /^select\b/i.test(sql.replace(leadingNoise, ''));

const maxJitterRatio = 0.5;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const withD1ReadRetry = (db: D1Database, options: D1ReadRetryOptions = {}): D1Database => {
  const maxAttempts = Math.max(1, options.maxAttempts ?? defaultMaxAttempts);
  const delaysMs = options.delaysMs ?? defaultDelaysMs;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const originals = new WeakMap<object, D1PreparedStatement>();

  const retrying = async <T>(sql: string, run: () => Promise<T>): Promise<T> => {
    // 書き込みは再試行すると二重に実行されうるので、SELECT だけを再試行する
    if (!isReadSql(sql)) return run();
    for (let attempt = 1;; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (attempt >= maxAttempts || !isTransientD1Error(error)) throw error;
        console.warn(
          `d1 read retry: attempt ${attempt}/${maxAttempts} failed: ${messageOf(error).slice(0, warnMessageLength)}`,
        );
        const delayMs = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
        await sleep(delayMs * (1 + random() * maxJitterRatio));
      }
    }
  };

  const wrapStatement = (original: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = {
      bind: (...values: unknown[]) => wrapStatement(original.bind(...values), sql),
      first: (...args: unknown[]) =>
        retrying(sql, () => Reflect.apply(original.first, original, args) as Promise<unknown>),
      all: () => retrying(sql, () => original.all()),
      run: () => original.run(),
      raw: (...args: unknown[]) => retrying(sql, () => Reflect.apply(original.raw, original, args) as Promise<unknown>),
    } as unknown as D1PreparedStatement;
    originals.set(wrapped, original);
    return wrapped;
  };

  const prepare = (query: string) => wrapStatement(db.prepare(query), query);
  const batch = (statements: ReadonlyArray<D1PreparedStatement>) =>
    db.batch(statements.map((statement) => originals.get(statement) ?? statement));

  return new Proxy(db, {
    get: (target, key) => {
      if (key === 'prepare') return prepare;
      if (key === 'batch') return batch;
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};
