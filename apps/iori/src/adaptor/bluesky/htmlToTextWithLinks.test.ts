import { describe, expect, it } from 'vitest';

import { htmlToTextWithLinks } from './htmlToTextWithLinks.ts';

describe('htmlToTextWithLinks', () => {
  it('段落を空行に、br を改行にし、エンティティを戻す', () => {
    const { text, links } = htmlToTextWithLinks('<p>a &amp; b<br>c</p><p>d</p>');
    expect(text).toBe('a & b\nc\n\nd');
    expect(links).toEqual([]);
  });

  it('a の位置をリンクにする', () => {
    const { text, links } = htmlToTextWithLinks(
      '<p>見て <a href="https://example.com/a?x=1&amp;y=2" rel="nofollow">example.com/a</a> です</p>',
    );
    expect(text).toBe('見て example.com/a です');
    expect(links).toEqual([{ start: 3, end: 16, uri: 'https://example.com/a?x=1&y=2' }]);
    expect(text.slice(links[0]!.start, links[0]!.end)).toBe('example.com/a');
  });

  it('入れ子の span と、http と https 以外の href を扱う', () => {
    const { text, links } = htmlToTextWithLinks(
      '<a href="https://example.com/t"><span>#</span><span>tag</span></a> <a href="javascript:alert(1)">bad</a><a href="/relative">rel</a>',
    );
    expect(text).toBe('#tag badrel');
    expect(links).toEqual([{ start: 0, end: 4, uri: 'https://example.com/t' }]);
  });

  it('閉じていない a を末尾で閉じる', () => {
    const { text, links } = htmlToTextWithLinks('x <a href="https://example.com/">open');
    expect(text).toBe('x open');
    expect(links).toEqual([{ start: 2, end: 6, uri: 'https://example.com/' }]);
  });

  it('script と style の中身を捨てる', () => {
    expect(htmlToTextWithLinks('<style>p{}</style>hi<script>x()</script>').text).toBe('hi');
  });
});
