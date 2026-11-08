import type { SqlJsStatic } from 'sql.js';

import { assert } from './assert.ts';
import { createConsole } from './console.ts';
import { maxMessageChars, truncate } from './limits.ts';
import { runEntry } from './modules.ts';
import { createDatabaseSync } from './sqlite-adapter.ts';
import { createTestRunner } from './test-runner.ts';
import type { RunOutcome, TestResult } from './types.ts';

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message === '' ? error.name : `${error.name}: ${error.message}`;
  }
  return String(error);
};

export const runCode = async (options: {
  SQL: SqlJsStatic;
  files: Readonly<Record<string, string>>;
  entry: string;
}): Promise<RunOutcome> => {
  const { console, lines, summary } = createConsole();
  const sqlite = createDatabaseSync(options.SQL);
  const runner = createTestRunner();
  const shims: Record<string, unknown> = {
    'node:sqlite': { DatabaseSync: sqlite.DatabaseSync },
    'node:test': runner.api,
    'node:assert': assert,
    'node:assert/strict': assert,
    assert,
    'assert/strict': assert,
  };
  let cutMessages = 0;
  const cut = (message: string): string => {
    if (message.length > maxMessageChars) {
      cutMessages += 1;
    }
    return truncate(message, maxMessageChars);
  };
  const finish = (tests: TestResult[] | null, error: string | null): RunOutcome => ({
    logs: lines,
    logSummary: summary(),
    tests: tests?.map((test) => ({ ...test, message: test.message === null ? null : cut(test.message) })) ?? null,
    cutMessages,
    error: error === null ? null : cut(error),
  });
  try {
    await runEntry({ files: options.files, entry: options.entry, shims, console });
    return finish(runner.hasTests() ? await runner.run() : null, null);
  } catch (error) {
    return finish(null, describeError(error));
  } finally {
    sqlite.closeAll();
  }
};
