import { describe, expect, test } from 'vitest';

import { pipe } from './pipe.js';

describe('pipe', () => {
  test('accepts 1 function', () => {
    const acc = pipe((x: number) => x + 1);
    expect(acc(1)).toBe(2);
  });

  test('accepts 2 functions', () => {
    const acc = pipe(
      (x: number) => x + 1,
      (x: number) => `Answer: ${x * 2}`,
    );
    expect(acc(1)).toBe('Answer: 4');
  });

  test('accepts 3 functions', () => {
    const acc = pipe(
      (x: number) => x + 1,
      (x: number) => x * 2,
      (x: number) => `Answer: ${x}`,
    );
    expect(acc(1)).toBe('Answer: 4');
  });

  test('accepts 10 functions', () => {
    const acc = pipe(
      (x: number) => x + 1,
      (x: number) => x * 2,
      (x: number) => x - 3,
      (x: number) => x * x,
      (x: number) => x - 7,
      (x: number) => x + 4,
      (x: number) => x * 3,
      (x: number) => x - 5,
      (x: number) => x - 2,
      (x: number) => `Answer: ${x}`,
    );
    expect(acc(1)).toBe('Answer: -13');
  });
});
