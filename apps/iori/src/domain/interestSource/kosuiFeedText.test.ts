import { describe, expect, it } from 'vitest';

import {
  buildKosuiPostText,
  classifyKosuiEntry,
  extractMarkdownBody,
  KOSUI_POST_TEXT_MAX_CHARS,
} from './kosuiFeedText.ts';

describe('classifyKosuiEntry', () => {
  it('接頭辞で種別を決め、接頭辞を title から外す', () => {
    expect(classifyKosuiEntry('[Talk] 登壇')).toEqual({ kind: 'kosui_talk', title: '登壇' });
    expect(classifyKosuiEntry('[External] 寄稿')).toEqual({ kind: 'kosui_external', title: '寄稿' });
    expect(classifyKosuiEntry('ふつうの記事')).toEqual({ kind: 'kosui_post', title: 'ふつうの記事' });
    expect(classifyKosuiEntry('[Talk]登壇')).toEqual({ kind: 'kosui_post', title: '[Talk]登壇' });
  });
});

describe('extractMarkdownBody', () => {
  it('先頭の frontmatter と、行頭が import か export の行を除く', () => {
    const markdown = [
      '---',
      'title: a',
      'tags: [b]',
      '---',
      'import Foo from \'./Foo.astro\';',
      'export const x = 1;',
      '',
      '本文の 1 行目',
      '  import は行頭でないので残る',
      '---',
      '本文の最後',
    ].join('\n');

    expect(extractMarkdownBody(markdown)).toBe('本文の 1 行目\n  import は行頭でないので残る\n---\n本文の最後');
  });

  it('frontmatter が無い、閉じていない、空のときの扱い', () => {
    expect(extractMarkdownBody('本文\n')).toBe('本文');
    expect(extractMarkdownBody('---\ntitle: a\n本文')).toBe('---\ntitle: a\n本文');
    expect(extractMarkdownBody('---\n---\n本文')).toBe('本文');
    expect(extractMarkdownBody('---\r\ntitle: a\r\n---\r\n本文')).toBe('本文');
  });
});

describe('buildKosuiPostText', () => {
  it('title と本文を改行でつなぎ、先頭 2,000 コードポイントに切る', () => {
    expect(buildKosuiPostText('題', '---\na: b\n---\n本文')).toBe('題\n本文');
    const text = buildKosuiPostText('題', '😀'.repeat(3000));
    expect(Array.from(text)).toHaveLength(KOSUI_POST_TEXT_MAX_CHARS);
    expect(text.startsWith('題\n😀')).toBe(true);
  });
});
