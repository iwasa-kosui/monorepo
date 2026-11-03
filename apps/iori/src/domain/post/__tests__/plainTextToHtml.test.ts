import { describe, expect, it } from 'vitest';

import { plainTextToHtml } from '../plainTextToHtml.ts';

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
});
