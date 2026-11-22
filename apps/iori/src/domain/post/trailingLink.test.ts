import { describe, expect, it } from 'vitest';

import { trailingLinkOf } from './trailingLink.ts';

describe('trailingLinkOf', () => {
  it('reads the link that ends the content, even when wrapped in markup', () => {
    const html =
      '<p>再テスト。<br><br><a href="https://remote.example/posts/1?a=1&amp;b=2" class="link"><span class="invisible">https://</span><span>remote.example/posts/1</span></a></p>';

    expect(trailingLinkOf(html)).toBe('https://remote.example/posts/1?a=1&b=2');
  });

  it('ignores a link followed by text', () => {
    expect(trailingLinkOf('<p><a href="https://remote.example/posts/1">link</a> を読んだ</p>')).toBeNull();
  });

  it('takes the last link when there are several', () => {
    const html = '<p><a href="https://a.example/1">a</a> <a href="https://b.example/2">b</a></p>';

    expect(trailingLinkOf(html)).toBe('https://b.example/2');
  });

  it.each([
    '<p>hi <span class="h-card"><a href="https://remote.example/@alice" class="u-url mention">@<span>alice</span></a></span></p>',
    '<p>hi <a href="https://remote.example/tags/x" class="mention hashtag" rel="tag">#<span>x</span></a></p>',
    '<p>hi <a href="https://remote.example/tags/x" rel="nofollow tag">#x</a></p>',
    '<p>hi <a href="https://remote.example/@alice">@alice</a></p>',
  ])('ignores mention and hashtag links: %s', (html) => {
    expect(trailingLinkOf(html)).toBeNull();
  });

  it.each([
    '<p>no links</p>',
    '<p><a href="javascript:alert(1)">x</a></p>',
    '<p><a href="/relative">x</a></p>',
    '<p><a>x</a></p>',
  ])('returns null when there is no http link: %s', (html) => {
    expect(trailingLinkOf(html)).toBeNull();
  });
});
