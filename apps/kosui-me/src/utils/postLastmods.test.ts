import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPostLastmods } from './postLastmods';

const writePost = (dir: string, name: string, frontmatter: string[]) => {
  writeFileSync(join(dir, name), `---\n${frontmatter.join('\n')}\n---\n\n本文\n`);
};

describe('listPostLastmods', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'post-lastmods-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('サブディレクトリの記事も含めて、/slug から公開日時の ISO 8601 への対応を返す', () => {
    mkdirSync(join(dir, 'nested'));
    writePost(dir, 'a.mdx', ['slug: "posts/2026/01/01/a"', 'date: "2026-01-01T00:30:00+09:00"']);
    writePost(join(dir, 'nested'), 'b.mdx', ['slug: "posts/b"', 'date: "2019-06-25T00:00:00+09:00"']);

    expect(listPostLastmods(dir)).toEqual(
      new Map([
        ['/posts/2026/01/01/a', '2025-12-31T15:30:00.000Z'],
        ['/posts/b', '2019-06-24T15:00:00.000Z'],
      ]),
    );
  });

  it('引用符のない日付（YAML が日付として読む値）も扱う', () => {
    writePost(dir, 'c.mdx', ['slug: "posts/c"', 'date: 2026-03-04']);

    expect(listPostLastmods(dir)).toEqual(new Map([['/posts/c', '2026-03-04T00:00:00.000Z']]));
  });

  it('日時として読めない記事、date や slug のない記事は含めない', () => {
    writePost(dir, 'd.mdx', ['slug: "posts/d"', 'date: "未定"']);
    writePost(dir, 'e.mdx', ['slug: "posts/e"']);
    writePost(dir, 'f.mdx', ['date: "2026-01-01T00:00:00+09:00"']);

    expect(listPostLastmods(dir)).toEqual(new Map());
  });
});
