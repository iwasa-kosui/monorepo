import { inspect } from './inspect.ts';

export class AssertionError extends Error {
  code = 'ERR_ASSERTION';
  actual: unknown;
  expected: unknown;
  operator: string;
  generatedMessage: boolean;

  constructor(
    options: { message: string; actual?: unknown; expected?: unknown; operator: string; generated: boolean },
  ) {
    super(options.message);
    this.name = 'AssertionError';
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator;
    this.generatedMessage = options.generated;
  }
}

type Message = string | Error | undefined;

const fail = (message: Message, generated: string, operator: string, actual?: unknown, expected?: unknown): never => {
  if (message instanceof Error) {
    throw message;
  }
  throw new AssertionError({
    message: message ?? generated,
    actual,
    expected,
    operator,
    generated: message === undefined,
  });
};

const hasTypedContent = (value: object): boolean => ArrayBuffer.isView(value) && !(value instanceof DataView);

const ownKeys = (value: object): (string | symbol)[] => [
  ...Object.keys(value),
  ...Object.getOwnPropertySymbols(value).filter((symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol)),
];

const deepStrictEqual = (a: unknown, b: unknown, memo: Map<object, object>): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (memo.get(a) === b) {
    return true;
  }
  memo.set(a, b);
  if (a instanceof Date && b instanceof Date && a.getTime() !== b.getTime()) {
    return false;
  }
  if (a instanceof RegExp && b instanceof RegExp && (a.source !== b.source || a.flags !== b.flags)) {
    return false;
  }
  if (a instanceof Error && b instanceof Error && (a.message !== b.message || a.name !== b.name)) {
    return false;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepStrictEqual(value, b.get(key), memo)) {
        return false;
      }
    }
  } else if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value) && ![...b].some((other) => deepStrictEqual(value, other, memo))) {
        return false;
      }
    }
  } else if (hasTypedContent(a) && hasTypedContent(b)) {
    const left = a as unknown as ArrayLike<unknown>;
    const right = b as unknown as ArrayLike<unknown>;
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!Object.is(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  const keysA = ownKeys(a);
  const keysB = ownKeys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key)
    && deepStrictEqual((a as Record<string | symbol, unknown>)[key], (b as Record<string | symbol, unknown>)[key], memo)
  );
};

const expandedInspect = (value: unknown): string =>
  inspect(value, { expanded: true, sorted: true, depth: 1000, maxArrayLength: Infinity });

const lineDiff = (actual: readonly string[], expected: readonly string[]): string[] => {
  const table = Array.from({ length: actual.length + 1 }, () => new Array<number>(expected.length + 1).fill(0));
  for (let i = actual.length - 1; i >= 0; i -= 1) {
    for (let j = expected.length - 1; j >= 0; j -= 1) {
      table[i]![j] = actual[i] === expected[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const output: string[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    output.push(...removed.map((line) => `+ ${line}`), ...added.map((line) => `- ${line}`));
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < actual.length || j < expected.length) {
    if (i < actual.length && j < expected.length && actual[i] === expected[j]) {
      flush();
      output.push(`  ${actual[i]}`);
      i += 1;
      j += 1;
    } else if (j >= expected.length || (i < actual.length && table[i + 1]![j]! >= table[i]![j + 1]!)) {
      removed.push(actual[i]!);
      i += 1;
    } else {
      added.push(expected[j]!);
      j += 1;
    }
  }
  flush();
  return output;
};

const diffMessage = (title: string, actual: unknown, expected: unknown): string =>
  `${title}\n+ actual - expected\n\n${
    lineDiff(expandedInspect(actual).split('\n'), expandedInspect(expected).split('\n')).join('\n')
  }\n`;

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== 'object' && typeof value !== 'function');

const matchesExpectation = (error: unknown, expected: unknown): string | undefined => {
  if (expected === undefined) {
    return undefined;
  }
  if (expected instanceof RegExp) {
    const text = String(error);
    return expected.test(text)
      ? undefined
      : `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(text)}\n`;
  }
  if (typeof expected === 'function') {
    const candidate = expected as { prototype?: unknown } & ((value: unknown) => unknown);
    if (candidate.prototype !== undefined && error instanceof candidate) {
      return undefined;
    }
    if (candidate === Error || candidate.prototype instanceof Error) {
      return `The error is expected to be an instance of "${candidate.name}". Received "${
        (error as { constructor?: { name?: string } } | null)?.constructor?.name ?? typeof error
      }"\n\nError message:\n\n${(error as { message?: string } | null)?.message ?? String(error)}`;
    }
    return candidate.call({}, error) === true
      ? undefined
      : 'The validation function is expected to return "true". Received false';
  }
  if (typeof expected === 'object' && expected !== null) {
    for (const key of Object.keys(expected)) {
      const want = (expected as Record<string, unknown>)[key];
      const got = (error as Record<string, unknown> | null)?.[key];
      const ok = want instanceof RegExp && typeof got === 'string'
        ? want.test(got)
        : deepStrictEqual(got, want, new Map());
      if (!ok) {
        return diffMessage(`Expected values to be strictly deep-equal:`, got, want);
      }
    }
  }
  return undefined;
};

const splitArguments = (
  expectedOrMessage: unknown,
  message: Message,
): { expected: unknown; message: Message } =>
  typeof expectedOrMessage === 'string' ? { expected: undefined, message: expectedOrMessage } : {
    expected: expectedOrMessage,
    message,
  };

const ok = (value: unknown, message?: Message): void => {
  if (!value) {
    fail(message, `The expression evaluated to a falsy value:\n\n  assert.ok(${inspect(value)})\n`, '==', value, true);
  }
};

const titleOf = (message: Message, fallback: string): string => (typeof message === 'string' ? message : fallback);

const equal = (actual: unknown, expected: unknown, message?: Message): void => {
  if (Object.is(actual, expected)) {
    return;
  }
  if (message instanceof Error) {
    throw message;
  }
  const title = titleOf(message, 'Expected values to be strictly equal:');
  const actualText = inspect(actual);
  const expectedText = inspect(expected);
  let text: string;
  if (
    isPrimitive(actual) && isPrimitive(expected) && !actualText.includes('\n') && !expectedText.includes('\n')
    && actualText.length + expectedText.length <= 12
  ) {
    text = `${title}\n\n${actualText} !== ${expectedText}\n`;
  } else if (deepStrictEqual(actual, expected, new Map())) {
    text = `${typeof message === 'string' ? message : 'Values have same structure but are not reference-equal:'}\n\n${
      expandedInspect(actual)
    }\n`;
  } else {
    text = diffMessage(title, actual, expected);
  }
  fail(undefined, text, 'strictEqual', actual, expected);
};

const notEqual = (actual: unknown, expected: unknown, message?: Message): void => {
  if (Object.is(actual, expected)) {
    fail(
      message,
      `Expected "actual" to be strictly unequal to: ${inspect(expected)}`,
      'notStrictEqual',
      actual,
      expected,
    );
  }
};

const deepEqual = (actual: unknown, expected: unknown, message?: Message): void => {
  if (!deepStrictEqual(actual, expected, new Map())) {
    if (message instanceof Error) {
      throw message;
    }
    fail(
      undefined,
      diffMessage(titleOf(message, 'Expected values to be strictly deep-equal:'), actual, expected),
      'deepStrictEqual',
      actual,
      expected,
    );
  }
};

const notDeepEqual = (actual: unknown, expected: unknown, message?: Message): void => {
  if (deepStrictEqual(actual, expected, new Map())) {
    fail(
      message,
      `Expected "actual" not to be strictly deep-equal to: ${inspect(expected)}`,
      'notDeepStrictEqual',
      actual,
      expected,
    );
  }
};

const throws = (fn: () => unknown, expectedOrMessage?: unknown, messageArg?: Message): void => {
  const { expected, message } = splitArguments(expectedOrMessage, messageArg);
  try {
    fn();
  } catch (error) {
    const problem = matchesExpectation(error, expected);
    if (problem !== undefined) {
      fail(message, problem, 'throws', error, expected);
    }
    return;
  }
  fail(undefined, `Missing expected exception${typeof message === 'string' ? `: ${message}` : '.'}`, 'throws');
};

const doesNotThrow = (fn: () => unknown, expectedOrMessage?: unknown, messageArg?: Message): void => {
  const { message } = splitArguments(expectedOrMessage, messageArg);
  try {
    fn();
  } catch (error) {
    fail(
      message,
      `Got unwanted exception.\nActual message: "${(error as { message?: string } | null)?.message ?? String(error)}"`,
      'doesNotThrow',
      error,
    );
  }
};

const rejects = async (
  promiseOrFn: Promise<unknown> | (() => Promise<unknown>),
  expectedOrMessage?: unknown,
  messageArg?: Message,
): Promise<void> => {
  const { expected, message } = splitArguments(expectedOrMessage, messageArg);
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    const problem = matchesExpectation(error, expected);
    if (problem !== undefined) {
      fail(message, problem, 'rejects', error, expected);
    }
    return;
  }
  fail(undefined, `Missing expected rejection${typeof message === 'string' ? `: ${message}` : '.'}`, 'rejects');
};

const doesNotReject = async (
  promiseOrFn: Promise<unknown> | (() => Promise<unknown>),
  expectedOrMessage?: unknown,
  messageArg?: Message,
): Promise<void> => {
  const { message } = splitArguments(expectedOrMessage, messageArg);
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    fail(
      message,
      `Got unwanted rejection.\nActual message: "${(error as { message?: string } | null)?.message ?? String(error)}"`,
      'doesNotReject',
      error,
    );
  }
};

const match = (value: unknown, pattern: RegExp, message?: Message): void => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(
      message,
      `The input did not match the regular expression ${inspect(pattern)}. Input:\n\n${inspect(value)}\n`,
      'match',
      value,
      pattern,
    );
  }
};

const doesNotMatch = (value: unknown, pattern: RegExp, message?: Message): void => {
  if (typeof value === 'string' && pattern.test(value)) {
    fail(
      message,
      `The input was expected to not match the regular expression ${inspect(pattern)}. Input:\n\n${inspect(value)}\n`,
      'doesNotMatch',
      value,
      pattern,
    );
  }
};

const failNow = (message?: Message): never => fail(message, 'Failed', 'fail');

export const assert = Object.assign((value: unknown, message?: Message): void => ok(value, message), {
  ok,
  equal,
  strictEqual: equal,
  notEqual,
  notStrictEqual: notEqual,
  deepEqual,
  deepStrictEqual: deepEqual,
  notDeepEqual,
  notDeepStrictEqual: notDeepEqual,
  throws,
  doesNotThrow,
  rejects,
  doesNotReject,
  match,
  doesNotMatch,
  fail: failNow,
  AssertionError,
});
Object.assign(assert, { strict: assert });
