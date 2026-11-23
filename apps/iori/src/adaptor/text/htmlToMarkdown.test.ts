import { describe, expect, it } from 'vitest';

import { PostContent } from '../../domain/post/postContent.ts';
import { htmlToMarkdown } from './htmlToMarkdown.ts';

const listHtml = '<h2>あなたへのおすすめ</h2><ul>'
  + '<li><a href="https://example.com/first">First article</a><br>一行目<br>二行目'
  + '<br>関心の根拠: <a href="https://kosui.me/posts/a">https://kosui.me/posts/a</a></li>'
  + '<li><a href="https://example.com/second">Second article</a></li></ul>';

describe('htmlToMarkdown', () => {
  it('見出し、箇条書き、リンクを Markdown にする', () => {
    expect(htmlToMarkdown(listHtml)).toBe(
      [
        '## あなたへのおすすめ',
        '',
        '-   [First article](https://example.com/first)  ',
        '    一行目  ',
        '    二行目  ',
        '    関心の根拠: [https://kosui.me/posts/a](https://kosui.me/posts/a)',
        '-   [Second article](https://example.com/second)',
      ].join('\n'),
    );
  });

  it('変換した Markdown を HTML に戻しても見出し、リンク、箇条書き、改行が残る', async () => {
    const html = await PostContent.fromMarkdown(htmlToMarkdown(listHtml));

    expect(html).toContain('<h2>あなたへのおすすめ</h2>');
    expect(html).toContain('<a href="https://example.com/first">First article</a>');
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
});
