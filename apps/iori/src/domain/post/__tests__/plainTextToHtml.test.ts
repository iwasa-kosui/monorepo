import { describe, expect, it } from 'vitest';

import { plainTextToHtml } from '../plainTextToHtml.ts';
import { sanitizePostContent } from '../sanitizePostContent.ts';

describe('plainTextToHtml', () => {
  it('wraps a line in a paragraph', () => {
    expect(plainTextToHtml('hello')).toBe('<p>hello</p>');
  });

  it('escapes HTML special characters', () => {
    expect(plainTextToHtml('<script>alert("a & b")</script>'))
      .toBe('<p>&lt;script&gt;alert(&quot;a &amp; b&quot;)&lt;/script&gt;</p>');
  });

  it('turns a newline into a br and a blank line into a new paragraph', () => {
    expect(plainTextToHtml('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('normalizes CRLF and treats a whitespace-only line as a paragraph break', () => {
    expect(plainTextToHtml('one\r\ntwo\r\n  \r\nthree')).toBe('<p>one<br>two</p><p>three</p>');
  });

  it('links http and https URLs', () => {
    expect(plainTextToHtml('see https://example.com/a?b=1&c=2 and http://example.org'))
      .toBe(
        '<p>see <a href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>'
          + ' and <a href="http://example.org">http://example.org</a></p>',
      );
  });

  it('keeps trailing punctuation and Japanese text outside the link', () => {
    expect(
      plainTextToHtml('見て https://example.com/path。続き (https://example.com/x). そして https://example.com/y!'),
    )
      .toBe(
        '<p>見て <a href="https://example.com/path">https://example.com/path</a>。続き '
          + '(<a href="https://example.com/x">https://example.com/x</a>). '
          + 'そして <a href="https://example.com/y">https://example.com/y</a>!</p>',
      );
  });

  it('keeps a closing parenthesis that belongs to the URL', () => {
    expect(plainTextToHtml('https://example.com/a_(b)'))
      .toBe('<p><a href="https://example.com/a_(b)">https://example.com/a_(b)</a></p>');
  });

  it('does not link other schemes', () => {
    expect(plainTextToHtml('javascript:alert(1) ftp://example.com')).toBe(
      '<p>javascript:alert(1) ftp://example.com</p>',
    );
  });

  it('returns an empty string for blank input', () => {
    expect(plainTextToHtml('')).toBe('');
    expect(plainTextToHtml(' \n\n ')).toBe('');
  });

  describe('mentions', () => {
    const resolved = new Map([['alice@remote.example', 'https://remote.example/users/alice']]);

    it('解決済みの acct を h-card のリンクにする', () => {
      expect(plainTextToHtml('hi @alice@remote.example!', resolved)).toBe(
        '<p>hi <span class="h-card"><a href="https://remote.example/users/alice" class="u-url mention">'
          + '@<span>alice@remote.example</span></a></span>!</p>',
      );
    });

    it('未解決の acct はプレーンテキストのまま残す', () => {
      expect(plainTextToHtml('hi @bob@other.example', resolved)).toBe('<p>hi @bob@other.example</p>');
    });

    it('解決済みの表がなければ acct をそのまま残す', () => {
      expect(plainTextToHtml('hi @alice@remote.example')).toBe('<p>hi @alice@remote.example</p>');
    });

    it('直前が英数字の acct と URL の中の acct はリンクにしない', () => {
      expect(plainTextToHtml('x@alice@remote.example https://remote.example/@alice@remote.example', resolved))
        .not.toContain('h-card');
    });

    it('URL と acct を同じ行でそれぞれリンクにする', () => {
      const html = plainTextToHtml('@alice@remote.example https://example.com/a', resolved);

      expect(html).toContain('class="u-url mention"');
      expect(html).toContain('<a href="https://example.com/a">https://example.com/a</a>');
    });

    it('サニタイズ後も class と href が残る', () => {
      const html = plainTextToHtml('@alice@remote.example', resolved);

      expect(sanitizePostContent(html)).toBe(html);
    });
  });
});
