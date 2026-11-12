import { describe, expect, it } from 'vitest';

import { escapeWithMentions, extractMentionAccts, mentionLinksOfHtml } from '../mention.ts';

describe('extractMentionAccts (plain)', () => {
  it('@user@host の形だけを acct として取り出す', () => {
    expect(extractMentionAccts('hi @alice@remote.example and @bob@other.example!', 'plain'))
      .toEqual(['alice@remote.example', 'bob@other.example']);
  });

  it('host がドットを含まないもの、@user だけのもの、メールアドレスは対象外にする', () => {
    expect(extractMentionAccts('@alice@localhost @alice alice@remote.example', 'plain')).toEqual([]);
  });

  it.each([
    ['英数字', 'x@alice@remote.example'],
    ['アンダースコア', '_@alice@remote.example'],
    ['ドット', '.@alice@remote.example'],
    ['スラッシュ', '/@alice@remote.example'],
    ['アットマーク', '@@alice@remote.example'],
  ])('直前が%sなら対象外にする', (_name, text) => {
    expect(extractMentionAccts(text, 'plain')).toEqual([]);
  });

  it('直前が空白、括弧、行頭なら対象にする', () => {
    expect(extractMentionAccts('(@a@b.example) @c@d.example', 'plain')).toEqual(['a@b.example', 'c@d.example']);
  });

  it('URL の中は対象外にする', () => {
    expect(extractMentionAccts('see https://remote.example/?x=1&@alice@remote.example', 'plain')).toEqual([]);
  });

  it('host の大文字小文字をそろえ、重複を除く', () => {
    expect(extractMentionAccts('@a@Remote.Example @a@remote.example', 'plain')).toEqual(['a@remote.example']);
  });

  it('user の大文字小文字も区別せず、重複を除く', () => {
    expect(extractMentionAccts('@Foo@host.example @foo@HOST.example', 'plain')).toEqual(['foo@host.example']);
    expect(extractMentionAccts('@Foo@host.example **@foo@host.example**', 'markdown')).toEqual(['foo@host.example']);
  });

  it('文末のピリオドは host に含めない', () => {
    expect(extractMentionAccts('thanks @a@remote.example.', 'plain')).toEqual(['a@remote.example']);
  });

  it('最大 10 件にする', () => {
    const text = Array.from({ length: 12 }, (_, i) => `@u${i}@remote.example`).join(' ');

    const accts = extractMentionAccts(text, 'plain');

    expect(accts).toHaveLength(10);
    expect(accts[9]).toBe('u9@remote.example');
  });
});

describe('extractMentionAccts (markdown)', () => {
  it('本文の acct を取り出し、重複を除く', () => {
    expect(extractMentionAccts('hi @a@b.example\n\n**@a@b.example** @c@d.example', 'markdown'))
      .toEqual(['a@b.example', 'c@d.example']);
  });

  it('インラインコードの中は対象外にする', () => {
    expect(extractMentionAccts('`@a@b.example` and @c@d.example', 'markdown')).toEqual(['c@d.example']);
  });

  it('コードブロックの中は対象外にする', () => {
    expect(extractMentionAccts('```\n@a@b.example\n```\n\n~~~\n@e@f.example\n~~~\n\n    @g@h.example', 'markdown'))
      .toEqual([]);
  });

  it('リンクの表示文字列の中は対象外にする', () => {
    expect(extractMentionAccts('[@a@b.example](https://example.com)', 'markdown')).toEqual([]);
  });

  it('直前が英数字なら対象外にする', () => {
    expect(extractMentionAccts('x@a@b.example', 'markdown')).toEqual([]);
  });

  it('リストと引用の中も対象にする', () => {
    expect(extractMentionAccts('- @a@b.example\n\n> @c@d.example', 'markdown')).toEqual(['a@b.example', 'c@d.example']);
  });

  it('最大 10 件にする', () => {
    const text = Array.from({ length: 12 }, (_, i) => `@u${i}@remote.example`).join(' ');

    expect(extractMentionAccts(text, 'markdown')).toHaveLength(10);
  });
});

describe('escapeWithMentions', () => {
  it('表の key の大文字小文字を区別せず照合する', () => {
    const html = escapeWithMentions(
      'hi @Alice@Remote.Example',
      new Map([['ALICE@remote.example', 'https://remote.example/users/alice']]),
    );

    expect(html).toContain('href="https://remote.example/users/alice"');
    expect(html).toContain('@<span>Alice@remote.example</span>');
  });
});

describe('mentionLinksOfHtml', () => {
  const mention = (href: string, name: string) =>
    `<span class="h-card"><a href="${href}" class="u-url mention">@<span>${name}</span></a></span>`;

  it('a.mention の href と表示文字列を取り出す', () => {
    expect(mentionLinksOfHtml(`<p>hi ${mention('https://remote.example/users/alice', 'alice@remote.example')}</p>`))
      .toEqual([{ href: 'https://remote.example/users/alice', name: '@alice@remote.example' }]);
  });

  it('class の順序と href の実体参照に依らず取り出す', () => {
    expect(
      mentionLinksOfHtml(
        '<a class="mention u-url" href="https://r.example/u?a=1&amp;b=2">@<span>a@r.example</span></a>',
      ),
    )
      .toEqual([{ href: 'https://r.example/u?a=1&b=2', name: '@a@r.example' }]);
  });

  it('mention クラスのない a、http(s) 以外の href、acct の形でない表示文字列は対象外にする', () => {
    const html = [
      '<a href="https://r.example/u/a">@a@r.example</a>',
      '<a class="mention" href="javascript:alert(1)">@b@r.example</a>',
      '<a class="mention" href="https://r.example/u/c">hello</a>',
    ].join('');

    expect(mentionLinksOfHtml(html)).toEqual([]);
  });

  it('同じ href は 1 件にする', () => {
    const html = mention('https://r.example/u/a', 'a@r.example') + mention('https://r.example/u/a', 'a@r.example');

    expect(mentionLinksOfHtml(html)).toHaveLength(1);
  });
});
