import { describe, expect, it } from 'vitest';

import { appendQuoteInline, removeQuoteInline } from './quoteInline.ts';
import { sanitizePostContent } from './sanitizePostContent.ts';

const quoteUri = 'https://remote.example/users/alice/statuses/1';

describe('appendQuoteInline', () => {
  it('引用先へのリンクが本文に無いとき、末尾に RE: の段落を足す', () => {
    expect(appendQuoteInline('<p>hi</p>', quoteUri)).toBe(
      `<p>hi</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`,
    );
  });

  it('足した段落はサニタイズ後も RE: と引用先へのリンクを残す', () => {
    const html = sanitizePostContent(appendQuoteInline('<p>hi</p>', quoteUri));

    expect(html).toBe(`<p>hi</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`);
  });

  it('URI の & と " は属性と本文でエスケープする', () => {
    const uri = 'https://remote.example/notes?a=1&b="2"';

    expect(appendQuoteInline('<p>hi</p>', uri)).toBe(
      '<p>hi</p><p>RE: <a href="https://remote.example/notes?a=1&amp;b=&quot;2&quot;">'
        + 'https://remote.example/notes?a=1&amp;b=&quot;2&quot;</a></p>',
    );
  });

  it('本文に引用先へのリンクが既にあれば足さない', () => {
    const html = `<p>see <a href="${quoteUri}">this</a></p>`;

    expect(appendQuoteInline(html, quoteUri)).toBe(html);
  });

  it('エンティティを含む href や末尾スラッシュ違いのリンクも既にあるものとして扱う', () => {
    const withQuery = 'https://remote.example/notes?a=1&b=2';
    const html = '<p><a href="https://remote.example/notes?a=1&amp;b=2" rel="nofollow">x</a></p>';

    expect(appendQuoteInline(html, withQuery)).toBe(html);
    expect(appendQuoteInline('<p><a href="https://remote.example">x</a></p>', 'https://remote.example/')).toBe(
      '<p><a href="https://remote.example">x</a></p>',
    );
  });

  it('別の URL へのリンクや本文中のただの文字列だけなら足す', () => {
    const html = `<p>${quoteUri} <a href="https://other.example/">other</a></p>`;

    expect(appendQuoteInline(html, quoteUri)).toBe(
      `${html}<p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`,
    );
  });
});

describe('removeQuoteInline', () => {
  it('appendQuoteInline が足した末尾の段落だけを取り除く', () => {
    expect(removeQuoteInline(appendQuoteInline('<p>hi</p>', quoteUri), quoteUri)).toBe('<p>hi</p>');
  });

  it('URI をエスケープした段落も取り除く', () => {
    const uri = 'https://remote.example/notes?a=1&b="2"';

    expect(removeQuoteInline(appendQuoteInline('<p>hi</p>', uri), uri)).toBe('<p>hi</p>');
  });

  it('ユーザーが本文に書いたリンクは残す', () => {
    const html = `<p>see <a href="${quoteUri}">this</a></p>`;

    expect(removeQuoteInline(html, quoteUri)).toBe(html);
  });

  it('末尾以外にある同じ形の段落や、別の URI の段落は残す', () => {
    const middle = `<p>RE: <a href="${quoteUri}">${quoteUri}</a></p><p>hi</p>`;
    const other = appendQuoteInline('<p>hi</p>', 'https://remote.example/users/alice/statuses/2');

    expect(removeQuoteInline(middle, quoteUri)).toBe(middle);
    expect(removeQuoteInline(other, quoteUri)).toBe(other);
  });
});
