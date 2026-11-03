import { describe, expect, it } from 'vitest';

import { sanitizeArticleBody } from './sanitizeArticleBody.ts';

describe('sanitizeArticleBody', () => {
  it('https の href を残し、rel を付ける', () => {
    expect(sanitizeArticleBody('<a href="https://example.com/a">link</a>')).toBe(
      '<a href="https://example.com/a" rel="noopener noreferrer nofollow">link</a>',
    );
  });

  it('http の href を残す', () => {
    expect(sanitizeArticleBody('<a href="http://example.com/a">link</a>')).toContain('href="http://example.com/a"');
  });

  it('入力にある rel を上書きする', () => {
    expect(sanitizeArticleBody('<a href="https://example.com" rel="opener">link</a>')).toContain(
      'rel="noopener noreferrer nofollow"',
    );
  });

  it('javascript: の href を消す', () => {
    const html = sanitizeArticleBody('<a href="javascript:alert(1)">link</a>');

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('href');
  });

  it.each([
    ['大文字混じりの scheme', '<a href="JaVaScRiPt:alert(1)">link</a>'],
    ['scheme の途中にタブ', '<a href="java\tscript:alert(1)">link</a>'],
    ['scheme の途中に改行', '<a href="java&#10;script:alert(1)">link</a>'],
    ['scheme の途中に制御文字', '<a href="java&#1;script:alert(1)">link</a>'],
    ['先頭に空白', '<a href="  javascript:alert(1)">link</a>'],
    ['data: の href', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">link</a>'],
  ])('%s の href を消す', (_label, input) => {
    const html = sanitizeArticleBody(input);

    expect(html).not.toContain('href');
    expect(html).not.toMatch(/javascript|data:/i);
  });

  it('span の class を消す', () => {
    expect(sanitizeArticleBody('<span class="fixed inset-0">a</span>')).toBe('<span>a</span>');
  });

  it('img を消す', () => {
    expect(sanitizeArticleBody('<p>a</p><img src="https://example.com/a.png" onerror="alert(1)">')).toBe('<p>a</p>');
  });

  it('script を中身ごと消す', () => {
    expect(sanitizeArticleBody('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>');
  });

  it('style 属性を消す', () => {
    expect(sanitizeArticleBody('<p style="color: red">a</p><span style="color: #fff">b</span>')).toBe(
      '<p>a</p><span>b</span>',
    );
  });

  it('table と h4 から h6 と hr を残す', () => {
    const html = '<h4>h</h4><h5>h</h5><h6>h</h6><hr /><table><thead><tr><th>a</th></tr></thead>'
      + '<tbody><tr><td>b</td></tr></tbody></table>';

    expect(sanitizeArticleBody(html)).toBe(html);
  });
});
