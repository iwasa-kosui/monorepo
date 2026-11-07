import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('第1章の出力例', () => {
  const page = read('src/content/chapters/chapter-1.mdx');
  const testNames = [...read('exercises/chapter-1-start/visits.test.ts').matchAll(/\bit\('([^']+)'/g)].map((match) =>
    match[1]
  );

  it('演習のテスト名をすべて載せている', () => {
    expect(testNames.length).toBe(8);
    for (const name of testNames) {
      expect(page).toContain(name);
    }
  });
});
