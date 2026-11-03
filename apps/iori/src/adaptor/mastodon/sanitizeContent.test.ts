import { describe, expect, it } from 'vitest';

import { sanitizeStatusContent } from './sanitizeContent.ts';

describe('sanitizeStatusContent', () => {
  it('removes script tags and event handler attributes', () => {
    const html = '<p onclick="alert(1)">hi<script>alert(1)</script><img src="x" onerror="alert(1)"></p>';

    expect(sanitizeStatusContent(html)).toBe('<p>hi</p>');
  });

  it('removes a javascript: href but keeps the text of the link', () => {
    const html = '<a href="javascript:alert(1)" rel="nofollow">click</a>';

    const sanitized = sanitizeStatusContent(html);

    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).toContain('click');
  });

  it('keeps an http or https link with href, rel and class', () => {
    const html =
      '<p><a href="https://remote.example/@alice" rel="nofollow noopener" class="u-url mention">@alice</a></p>';

    expect(sanitizeStatusContent(html)).toBe(html);
  });

  it('removes hrefs that use other schemes', () => {
    const sanitized = sanitizeStatusContent(
      '<a href="data:text/html,x">a</a><a href="mailto:a@example.com">b</a><a href="//evil.example/x">c</a>',
    );

    expect(sanitized).not.toContain('href');
  });

  it('keeps br, span with class and the tags the UI renders', () => {
    const html =
      '<p>a<br />b <span class="invisible">c</span></p><pre><code>x</code></pre><ul><li><strong>d</strong></li></ul>';

    expect(sanitizeStatusContent(html)).toBe(html);
  });

  it('removes tags and attributes that are not allowed', () => {
    const sanitized = sanitizeStatusContent('<iframe src="https://x.example"></iframe><div id="a"><p>ok</p></div>');

    expect(sanitized).toBe('<p>ok</p>');
  });
});
