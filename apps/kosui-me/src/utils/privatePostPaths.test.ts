import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPrivatePostPaths } from './privatePostPaths';

const writePost = (dir: string, name: string, frontmatter: string[]) => {
  writeFileSync(join(dir, name), `---\n${frontmatter.join('\n')}\n---\n\n本文\n`);
};

describe('listPrivatePostPaths', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'private-post-paths-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('private: true の記事だけを /slug で返す', () => {
    mkdirSync(join(dir, 'nested'));
    writePost(dir, 'a.mdx', ['title: "A"', 'slug: "posts/2026/01/01/a"', 'private: true']);
    writePost(join(dir, 'nested'), 'b.mdx', ['title: "B"', 'slug: \'posts/2026/01/02/b\'', 'private: true']);
    writePost(dir, 'c.mdx', ['title: "C"', 'slug: "posts/2026/01/03/c"']);
    writePost(dir, 'd.mdx', ['title: "D"', 'slug: "posts/2026/01/04/d"', 'private: false']);

    expect(listPrivatePostPaths(dir)).toEqual(
      new Set(['/posts/2026/01/01/a', '/posts/2026/01/02/b']),
    );
  });

  it('slug が無い private の記事があれば throw する', () => {
    writePost(dir, 'e.mdx', ['title: "E"', 'private: true']);

    expect(() => listPrivatePostPaths(dir)).toThrow(/slug/);
  });
});
