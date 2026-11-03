import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listNoindexPostPaths } from './noindexPostPaths';

const writePost = (dir: string, name: string, frontmatter: string[]) => {
  writeFileSync(join(dir, name), `---\n${frontmatter.join('\n')}\n---\n\n本文\n`);
};

describe('listNoindexPostPaths', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'noindex-post-paths-'));
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

    expect(listNoindexPostPaths(dir)).toEqual(
      new Set(['/posts/2026/01/01/a', '/posts/2026/01/02/b']),
    );
  });

  it('draft: true の記事を private 指定がなくても返し、draft: false は返さない', () => {
    writePost(dir, 'f.mdx', ['title: "F"', 'slug: "posts/2026/01/05/f"', 'draft: true']);
    writePost(dir, 'g.mdx', ['title: "G"', 'slug: "posts/2026/01/06/g"', 'draft: false']);

    expect(listNoindexPostPaths(dir)).toEqual(new Set(['/posts/2026/01/05/f']));
  });

  it('private: True と、コメント付きの draft: true の記事を返す', () => {
    writePost(dir, 'h.mdx', ['title: "H"', 'slug: "posts/2026/01/07/h"', 'private: True']);
    writePost(dir, 'i.mdx', ['title: "I"', 'slug: "posts/2026/01/08/i"', 'draft: true # メモ']);

    expect(listNoindexPostPaths(dir)).toEqual(
      new Set(['/posts/2026/01/07/h', '/posts/2026/01/08/i']),
    );
  });

  it('slug を >- で折り返して書いた記事を正しいパスで返す', () => {
    writePost(dir, 'j.mdx', ['title: "J"', 'slug: >-', '  posts/2026/01/09/j', 'private: true']);

    expect(listNoindexPostPaths(dir)).toEqual(new Set(['/posts/2026/01/09/j']));
  });

  it('slug が無い noindex の記事があれば throw する', () => {
    writePost(dir, 'e.mdx', ['title: "E"', 'private: true']);

    expect(() => listNoindexPostPaths(dir)).toThrow(/slug/);
  });
});
