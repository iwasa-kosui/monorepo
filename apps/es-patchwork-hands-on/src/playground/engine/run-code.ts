import type { Database, SqlJsStatic } from 'sql.js';

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

const createShims = (
  sqlite: ReturnType<typeof createDatabaseSync>,
  runner: ReturnType<typeof createTestRunner>,
): Record<string, unknown> => ({
  'node:sqlite': { DatabaseSync: sqlite.DatabaseSync },
  'node:test': runner.api,
  'node:assert': assert,
  'node:assert/strict': assert,
  assert,
  'assert/strict': assert,
});

export const runCode = async (options: {
  SQL: SqlJsStatic;
  files: Readonly<Record<string, string>>;
  entry: string;
}): Promise<RunOutcome> => {
  const logs: LogLine[] = [];
  const console = createConsole(logs);
  const sqlite = createDatabaseSync(options.SQL);
  const runner = createTestRunner();
  try {
    await runEntry({ files: options.files, entry: options.entry, shims: createShims(sqlite, runner), console });
    const tests = runner.hasTests() ? await runner.run() : null;
    return { logs, tests, error: null };
  } catch (error) {
    return { logs, tests: null, error: describeError(error) };
  } finally {
    sqlite.closeAll();
  }
};

export const runForDatabase = async (options: {
  SQL: SqlJsStatic;
  files: Readonly<Record<string, string>>;
  entry: string;
}): Promise<{ database: Database | null; error: string | null }> => {
  const console = createConsole([]);
  const sqlite = createDatabaseSync(options.SQL);
  try {
    await runEntry({
      files: options.files,
      entry: options.entry,
      shims: createShims(sqlite, createTestRunner()),
      console,
    });
    const [database, ...others] = sqlite.databases();
    if (database === undefined || others.length > 0) {
      return { database: null, error: `${options.entry} が作ったデータベースが ${others.length + (database === undefined ? 0 : 1)} 個あります` };
    }
    sqlite.release(database);
    return { database, error: null };
  } catch (error) {
    return { database: null, error: describeError(error) };
  } finally {
    sqlite.closeAll();
  }
};
