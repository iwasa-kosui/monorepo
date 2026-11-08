import type { TestResult } from './types.ts';

type Hook = () => unknown;
type TestFn = (context: { name: string }) => unknown;
type Options = { skip?: unknown; todo?: unknown };

type Suite = {
  kind: 'suite';
  name: string;
  parent: Suite | null;
  items: (Suite | Case)[];
  before: Hook[];
  after: Hook[];
  beforeEach: Hook[];
  afterEach: Hook[];
  skipped: boolean;
};

type Case = { kind: 'case'; name: string; parent: Suite; fn: TestFn | undefined; skipped: boolean };

const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : String(error);
};

const newSuite = (name: string, parent: Suite | null, skipped: boolean): Suite => ({
  kind: 'suite',
  name,
  parent,
  items: [],
  before: [],
  after: [],
  beforeEach: [],
  afterEach: [],
  skipped,
});

const parseArguments = (
  optionsOrFn: Options | TestFn | undefined,
  maybeFn: TestFn | undefined,
  extra: Options,
): { options: Options; fn: TestFn | undefined } =>
  typeof optionsOrFn === 'function'
    ? { options: extra, fn: optionsOrFn }
    : { options: { ...optionsOrFn, ...extra }, fn: maybeFn };

const isSkipped = (parent: Suite, options: Options, fn: TestFn | undefined): boolean =>
  parent.skipped || (options.skip !== undefined && options.skip !== false) || options.todo !== undefined
  || fn === undefined;

const ancestors = (suite: Suite): Suite[] => (suite.parent === null ? [suite] : [...ancestors(suite.parent), suite]);

type Define = (name: string, optionsOrFn?: Options | TestFn, maybeFn?: TestFn) => void;

const withModifiers = (
  define: (
    name: string,
    optionsOrFn: Options | TestFn | undefined,
    maybeFn: TestFn | undefined,
    extra: Options,
  ) => void,
) =>
  Object.assign<Define, { skip: Define; todo: Define }>(
    (name, optionsOrFn, maybeFn) => define(name, optionsOrFn, maybeFn, {}),
    {
      skip: (name, optionsOrFn, maybeFn) => define(name, optionsOrFn, maybeFn, { skip: true }),
      todo: (name, optionsOrFn, maybeFn) => define(name, optionsOrFn, maybeFn, { todo: true }),
    },
  );

export const createTestRunner = () => {
  const root = newSuite('', null, false);
  let current = root;

  const describe = withModifiers((name, optionsOrFn, maybeFn, extra) => {
    const { options, fn } = parseArguments(optionsOrFn, maybeFn, extra);
    const suite = newSuite(name, current, isSkipped(current, options, () => undefined));
    current.items.push(suite);
    const previous = current;
    current = suite;
    try {
      fn?.({ name });
    } finally {
      current = previous;
    }
  });

  const it = withModifiers((name, optionsOrFn, maybeFn, extra) => {
    const { options, fn } = parseArguments(optionsOrFn, maybeFn, extra);
    current.items.push({ kind: 'case', name, parent: current, fn, skipped: isSkipped(current, options, fn) });
  });

  const api = Object.assign((name: string, optionsOrFn?: Options | TestFn, maybeFn?: TestFn): void => {
    it(name, optionsOrFn, maybeFn);
  }, {
    skip: it.skip,
    todo: it.todo,
    test: it,
    it,
    describe,
    suite: describe,
    before: (fn: Hook): void => {
      current.before.push(fn);
    },
    after: (fn: Hook): void => {
      current.after.push(fn);
    },
    beforeEach: (fn: Hook): void => {
      current.beforeEach.push(fn);
    },
    afterEach: (fn: Hook): void => {
      current.afterEach.push(fn);
    },
  });

  const hasTests = (): boolean => root.items.length > 0;

  const run = async (): Promise<TestResult[]> => {
    const results: TestResult[] = [];
    const runHooks = async (hooks: readonly Hook[]): Promise<void> => {
      for (const hook of hooks) {
        await hook();
      }
    };
    const walk = async (suite: Suite): Promise<void> => {
      const path = ancestors(suite).slice(1).map((entry) => entry.name);
      let beforeFailed: unknown;
      let beforeDidFail = false;
      if (!suite.skipped) {
        try {
          await runHooks(suite.before);
        } catch (error) {
          beforeDidFail = true;
          beforeFailed = error;
        }
      }
      for (const item of suite.items) {
        if (item.kind === 'suite') {
          await walk(item);
          continue;
        }
        if (item.skipped) {
          results.push({ name: item.name, path, status: 'skipped', message: null });
          continue;
        }
        if (beforeDidFail) {
          results.push({ name: item.name, path, status: 'fail', message: messageOf(beforeFailed) });
          continue;
        }
        const chain = ancestors(item.parent);
        let failure: unknown;
        let failed = false;
        try {
          for (const entry of chain) {
            await runHooks(entry.beforeEach);
          }
          await item.fn?.({ name: item.name });
        } catch (error) {
          failed = true;
          failure = error;
        }
        for (const entry of [...chain].reverse()) {
          try {
            await runHooks(entry.afterEach);
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
        }
        results.push(
          failed
            ? { name: item.name, path, status: 'fail', message: messageOf(failure) }
            : { name: item.name, path, status: 'pass', message: null },
        );
      }
      if (!suite.skipped) {
        try {
          await runHooks(suite.after);
        } catch (error) {
          results.push({ name: suite.name || '(root)', path, status: 'fail', message: messageOf(error) });
        }
      }
    };
    await walk(root);
    return results;
  };

  return { api, hasTests, run };
};
