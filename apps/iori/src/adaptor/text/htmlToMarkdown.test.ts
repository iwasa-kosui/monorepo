import { describe, expect, it } from 'vitest';

import { buildDigestBodies } from '../../domain/digest/digestBody.ts';
import { PostContent } from '../../domain/post/postContent.ts';
import { htmlToMarkdown } from './htmlToMarkdown.ts';

const digest = buildDigestBodies({
  radar: undefined,
  entries: [
    {
      title: 'First article',
      url: 'https://example.com/first',
      summary: '一行目\n二行目',
      hatenaBookmarkCount: 12,
    },
    { title: 'Second article', url: 'https://example.com/second', summary: null, hatenaBookmarkCount: null },
  ],
  timelineTrends: [],
  hatenaTrends: [],
});

describe('htmlToMarkdown', () => {
  it('ダイジェストの本文を見出しと箇条書きとリンクの Markdown にする', () => {
    expect(htmlToMarkdown(digest.privateHtml)).toBe(
      [
        '## 新着',
        '',
        '-   [First article](https://example.com/first)（はてなブックマーク 12）  ',
        '    一行目  ',
        '    二行目',
        '-   [Second article](https://example.com/second)',
      ].join('\n'),
    );
  });

  it('変換した Markdown を HTML に戻しても見出し、リンク、箇条書き、改行が残る', async () => {
    const html = await PostContent.fromMarkdown(htmlToMarkdown(digest.privateHtml));

    expect(html).toContain('<h2>新着</h2>');
    expect(html).toContain('<a href="https://example.com/first">First article</a>（はてなブックマーク 12）');
    expect(html).toContain('<br />');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it('段落、強調、コードブロック、引用を Markdown にする', () => {
    expect(htmlToMarkdown('<p>a <strong>b</strong> <em>c</em></p><blockquote><p>q</p></blockquote>')).toBe(
      'a **b** *c*\n\n> q',
    );
    expect(htmlToMarkdown('<pre><code class="language-ts">const a = 1;</code></pre>')).toBe(
      '```ts\nconst a = 1;\n```',
    );
  });

  it('table は HTML のまま Markdown の中に残す', () => {
    const table =
      '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';

    expect(htmlToMarkdown(`<p>before</p>${table}`)).toBe(`before\n\n${table}`);
  });

  it('空の HTML は空文字にする', () => {
    expect(htmlToMarkdown('')).toBe('');
  });
});
