import { describe, expect, it } from 'vitest';

import { sanitizeStatusContent } from '../../../adaptor/mastodon/sanitizeContent.ts';
import { PostContent } from '../postContent.ts';

describe('PostContent.fromMarkdown', () => {
  it('highlights a fenced code block with dual themes', async () => {
    const html = await PostContent.fromMarkdown('```typescript\nconst answer: number = 42;\n```');

    expect(html).toContain('<pre class="shiki shiki-themes" style="');
    expect(html).toContain('--shiki-dark:');
    expect(html).toContain('answer');
  });

  it('falls back to plaintext for an unsupported language', async () => {
    const html = await PostContent.fromMarkdown('```unknownlang\nhello\n```');

    expect(html).toContain('<pre class="shiki shiki-themes" style="');
    expect(html).toContain('hello');
  });

  it('removes script, event handler attributes, javascript: links and iframes', async () => {
    const html = await PostContent.fromMarkdown(
      [
        '<script>alert(1)</script>',
        '',
        '<img src="x" onerror="alert(2)">',
        '',
        '<p onclick="alert(3)">hi</p>',
        '',
        '[click](javascript:alert(4))',
        '',
        '<a href="javascript:alert(5)">raw</a>',
        '',
        '<iframe src="https://evil.example"></iframe>',
      ].join('\n'),
    );

    expect(html).not.toMatch(/<script|<iframe|<img|onerror|onclick|javascript:/i);
    expect(html).toContain('click');
    expect(html).toContain('raw');
    expect(html).toContain('hi');
  });

  it('keeps links, emphasis, lists, inline code and block quotes', async () => {
    const html = await PostContent.fromMarkdown(
      '[site](https://example.com/a) *em* **strong** `code`\n\n- one\n- two\n\n> quote',
    );

    expect(html).toContain('<a href="https://example.com/a">site</a>');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>');
  });

  it('keeps the code block of a fenced block', async () => {
    const html = await PostContent.fromMarkdown('```typescript\nconst answer = 42;\n```');

    expect(html).toContain('<pre');
    expect(html).toContain('<code>');
    expect(html).toContain('answer');
  });

  it('drops an image because img is not an allowed tag, as it is when the status is rendered', async () => {
    const html = await PostContent.fromMarkdown('before ![alt](https://example.com/a.png) after');

    expect(html).not.toContain('<img');
    expect(html).toContain('before');
    expect(html).toContain('after');
  });

  it('keeps a script tag inside a code block as escaped text in the highlighted spans', async () => {
    const html = await PostContent.fromMarkdown('```html\n<script>alert(1)</script>\n```');

    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<span>&lt;script&gt;alert(1)&lt;/script&gt;</span>');
  });

  it('gives a code block the same result as the status rendering', async () => {
    const html = await PostContent.fromMarkdown('```typescript\nconst answer: number = 42;\n```');

    expect(sanitizeStatusContent(html)).toBe(html);
    expect(html).toMatch(/^<pre class="shiki shiki-themes" style="background-color:#faf4ed;--shiki-dark-bg:#191724;/);
    expect(html).toContain('<span style="color:#286983;--shiki-dark:#31748F">const</span>');
    expect(html).not.toContain('rose-pine');
  });

  describe('mentions', () => {
    const alice = 'https://remote.example/users/alice';
    const resolved = new Map([['alice@remote.example', alice]]);
    const link =
      `<span class="h-card"><a href="${alice}" class="u-url mention">@<span>alice@remote.example</span></a></span>`;

    it('解決済みの acct を h-card のリンクにして、サニタイズ後も class と href を残す', async () => {
      const html = await PostContent.fromMarkdown('hi @alice@remote.example!', resolved);

      expect(html).toBe(`<p>hi ${link}!</p>\n`);
    });

    it('表の key の大文字小文字を区別せず、本文に書かれた user の表記を表示に残す', async () => {
      const html = await PostContent.fromMarkdown(
        'hi @Alice@Remote.Example',
        new Map([['ALICE@remote.example', alice]]),
      );

      expect(html).toBe(
        `<p>hi <span class="h-card"><a href="${alice}" class="u-url mention">@<span>Alice@remote.example</span></a></span></p>\n`,
      );
    });

    it('未解決の acct は mailto リンクにせずプレーンテキストで残す', async () => {
      const html = await PostContent.fromMarkdown('hi @bob@other.example', resolved);

      expect(html).toBe('<p>hi @bob@other.example</p>\n');
    });

    it('強調やリストの中の acct もリンクにする', async () => {
      const html = await PostContent.fromMarkdown('**@alice@remote.example**\n\n- @alice@remote.example', resolved);

      expect(html).toContain(`<strong>${link}</strong>`);
      expect(html).toContain(`<li>${link}</li>`);
    });

    it('コードとリンクの表示文字列の中の acct はそのまま残す', async () => {
      const html = await PostContent.fromMarkdown(
        '`@alice@remote.example`\n\n[@alice@remote.example](https://example.com)',
        resolved,
      );

      expect(html).not.toContain('h-card');
      expect(html).toContain('<code>@alice@remote.example</code>');
      expect(html).toContain('<a href="https://example.com">@alice@remote.example</a>');
    });

    it('直前が英数字の acct はメンションにしない', async () => {
      const html = await PostContent.fromMarkdown('x@alice@remote.example', resolved);

      expect(html).not.toContain('h-card');
    });

    it('通常のメールアドレスは従来どおり自動リンクの対象にする', async () => {
      const html = await PostContent.fromMarkdown('mail foo@bar.example', resolved);

      expect(html).toContain('foo@bar.example');
      expect(html).not.toContain('h-card');
    });

    it('解決済みの表を渡さないときは従来の変換をする', async () => {
      const html = await PostContent.fromMarkdown('hi @alice@remote.example');

      expect(html).not.toContain('h-card');
      expect(html).toContain('alice@remote.example');
    });
  });
});
