import type { SqlJsStatic } from 'sql.js';

import { assert } from './assert.ts';
import { createConsole } from './console.ts';
import { runEntry } from './modules.ts';
import { createDatabaseSync } from './sqlite-adapter.ts';
import { createTestRunner } from './test-runner.ts';
import type { LogLine, RunOutcome } from './types.ts';

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
  const logs: LogLine[] = [];
  const console = createConsole(logs);
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
  try {
    await runEntry({ files: options.files, entry: options.entry, shims, console });
    const tests = runner.hasTests() ? await runner.run() : null;
    return { logs, tests, error: null };
  } catch (error) {
    return { logs, tests: null, error: describeError(error) };
  } finally {
    sqlite.closeAll();
  }
};
