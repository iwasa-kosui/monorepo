export const ambientPath = '/ambient.d.ts';

export const ambientDeclarations = `interface Console {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  dir(value: unknown): void;
  table(data: unknown, properties?: readonly string[]): void;
  assert(condition: unknown, ...args: unknown[]): void;
  group(...args: unknown[]): void;
  groupCollapsed(...args: unknown[]): void;
  groupEnd(): void;
}

declare var console: Console;

declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | ArrayBufferView;
  export type SQLOutputValue = null | number | bigint | string | Uint8Array<ArrayBuffer>;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    private constructor();
    all(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue>[];
    all(
      namedParameters: Record<string, SQLInputValue>,
      ...anonymousParameters: SQLInputValue[]
    ): Record<string, SQLOutputValue>[];
    get(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    get(
      namedParameters: Record<string, SQLInputValue>,
      ...anonymousParameters: SQLInputValue[]
    ): Record<string, SQLOutputValue> | undefined;
    iterate(...anonymousParameters: SQLInputValue[]): IterableIterator<Record<string, SQLOutputValue>>;
    iterate(
      namedParameters: Record<string, SQLInputValue>,
      ...anonymousParameters: SQLInputValue[]
    ): IterableIterator<Record<string, SQLOutputValue>>;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
    run(
      namedParameters: Record<string, SQLInputValue>,
      ...anonymousParameters: SQLInputValue[]
    ): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

declare module 'node:test' {
  export interface TestContext {
    readonly name: string;
  }
  export interface TestOptions {
    skip?: boolean | string;
    todo?: boolean | string;
  }
  export type TestFn = (context: TestContext) => void | Promise<void>;
  export type HookFn = () => void | Promise<void>;
  export interface Define {
    (name: string, fn?: TestFn): void;
    (name: string, options: TestOptions, fn?: TestFn): void;
  }
  export interface Test extends Define {
    skip: Define;
    todo: Define;
    only: Define;
  }
  export const test: Test;
  export const it: Test;
  export const describe: Test;
  export const suite: Test;
  export function before(fn: HookFn): void;
  export function after(fn: HookFn): void;
  export function beforeEach(fn: HookFn): void;
  export function afterEach(fn: HookFn): void;
  export default test;
}

declare module 'node:assert' {
  function assert(value: unknown, message?: string | Error): asserts value;
  namespace assert {
    type Message = string | Error;
    type ErrorMatcher = RegExp | ((error: unknown) => boolean) | object;
    function ok(value: unknown, message?: Message): asserts value;
    function equal(actual: unknown, expected: unknown, message?: Message): void;
    function notEqual(actual: unknown, expected: unknown, message?: Message): void;
    function strictEqual<T>(actual: unknown, expected: T, message?: Message): asserts actual is T;
    function notStrictEqual(actual: unknown, expected: unknown, message?: Message): void;
    function deepEqual(actual: unknown, expected: unknown, message?: Message): void;
    function notDeepEqual(actual: unknown, expected: unknown, message?: Message): void;
    function deepStrictEqual<T>(actual: unknown, expected: T, message?: Message): asserts actual is T;
    function notDeepStrictEqual(actual: unknown, expected: unknown, message?: Message): void;
    function throws(block: () => unknown, message?: Message): void;
    function throws(block: () => unknown, error: ErrorMatcher, message?: Message): void;
    function doesNotThrow(block: () => unknown, message?: Message): void;
    function doesNotThrow(block: () => unknown, error: ErrorMatcher, message?: Message): void;
    function rejects(block: Promise<unknown> | (() => Promise<unknown>), message?: Message): Promise<void>;
    function rejects(
      block: Promise<unknown> | (() => Promise<unknown>),
      error: ErrorMatcher,
      message?: Message,
    ): Promise<void>;
    function doesNotReject(block: Promise<unknown> | (() => Promise<unknown>), message?: Message): Promise<void>;
    function doesNotReject(
      block: Promise<unknown> | (() => Promise<unknown>),
      error: ErrorMatcher,
      message?: Message,
    ): Promise<void>;
    function match(value: string, regExp: RegExp, message?: Message): void;
    function doesNotMatch(value: string, regExp: RegExp, message?: Message): void;
    function fail(message?: Message): never;
    class AssertionError extends Error {
      actual: unknown;
      expected: unknown;
      operator: string;
      generatedMessage: boolean;
      code: 'ERR_ASSERTION';
    }
    interface Strict {
      (value: unknown, message?: Message): asserts value;
      ok: typeof ok;
      equal: typeof strictEqual;
      notEqual: typeof notStrictEqual;
      strictEqual: typeof strictEqual;
      notStrictEqual: typeof notStrictEqual;
      deepEqual: typeof deepStrictEqual;
      notDeepEqual: typeof notDeepStrictEqual;
      deepStrictEqual: typeof deepStrictEqual;
      notDeepStrictEqual: typeof notDeepStrictEqual;
      throws: typeof throws;
      doesNotThrow: typeof doesNotThrow;
      rejects: typeof rejects;
      doesNotReject: typeof doesNotReject;
      match: typeof match;
      doesNotMatch: typeof doesNotMatch;
      fail: typeof fail;
      AssertionError: typeof AssertionError;
      strict: Strict;
    }
    const strict: Strict;
  }
  export = assert;
}

declare module 'node:assert/strict' {
  import assert = require('node:assert');
  const strict: assert.Strict;
  export = strict;
}
`;
