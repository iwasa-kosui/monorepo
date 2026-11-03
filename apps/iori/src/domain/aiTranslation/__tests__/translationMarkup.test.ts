import { describe, expect, it } from 'vitest';

import {
  fromTranslatedText,
  MAX_TRANSLATION_INPUT_CHARS,
  toTranslationSource,
  truncateTranslationSource,
  TRUNCATION_NOTICE,
  withTruncationNotice,
} from '../translationMarkup.ts';

const link = '<a href="https://example.com/a?x=1&amp;y=2" rel="nofollow noopener">example.com/a</a>';
const mention =
  '<span class="h-card"><a href="https://remote.example/@bob" class="u-url mention">@<span>bob</span></a></span>';
const mentionAnchor = '<a href="https://remote.example/@bob" class="u-url mention">@<span>bob</span></a>';
const hashtag = '<a href="https://remote.example/tags/cat" class="mention hashtag" rel="tag">#<span>cat</span></a>';

describe('toTranslationSource', () => {
  it('リンク、メンション、ハッシュタグを順に印へ置き換え、元の <a> 要素を配列に入れる', () => {
    const source = toTranslationSource(`<p>${mention} Look ${link} ${hashtag}</p>`);

    expect(source.text).toBe('⟦1⟧ Look ⟦2⟧ ⟦3⟧');
    expect(source.anchors).toEqual([mentionAnchor, link, hashtag]);
  });

  it('</p><p> を空行に、<br> を改行にする', () => {
    expect(toTranslationSource('<p>one<br>two</p><p>three</p>').text).toBe('one\ntwo\n\nthree');
    expect(toTranslationSource('<p>one<br/>two<BR />three</p>').text).toBe('one\ntwo\nthree');
  });

  it('ほかのタグを除き、HTML エンティティを平文に戻す', () => {
    expect(
      toTranslationSource('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; <strong>f</strong> &#x1F600;</p>').text,
    )
      .toBe('a & b <c> "d" \'e\' f 😀');
  });

  it('script と style の中身は残さない', () => {
    expect(toTranslationSource('<p>a<script>alert(1)</script><style>p{}</style>b</p>').text).toBe('ab');
  });

  it('印のない平文は anchors を空にする', () => {
    expect(toTranslationSource('<p>plain</p>')).toEqual({ text: 'plain', anchors: [] });
  });

  it('空の本文は空の平文にする', () => {
    expect(toTranslationSource('')).toEqual({ text: '', anchors: [] });
  });
});

describe('fromTranslatedText', () => {
  it('印を元の <a> 要素に戻す', () => {
    const html = fromTranslatedText('⟦1⟧ さん、⟦2⟧ を見て ⟦3⟧', [mentionAnchor, link, hashtag]);

    expect(html).toBe(`<p>${mentionAnchor} さん、${link} を見て ${hashtag}</p>`);
  });

  it('訳文を HTML エスケープする', () => {
    expect(fromTranslatedText('<script>alert("x")</script> & \'y\'', [])).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>',
    );
  });

  it('空行で段落を分け、段落内の改行を <br> にする', () => {
    expect(fromTranslatedText('一\n二\n\n三', [])).toBe('<p>一<br>二</p><p>三</p>');
  });

  it('CRLF と空白だけの行も段落の区切りとして扱う', () => {
    expect(fromTranslatedText('一\r\n  \r\n二', [])).toBe('<p>一</p><p>二</p>');
  });

  it('訳文から欠けた印の <a> を、最後の段落の末尾に空白区切りで足す', () => {
    const html = fromTranslatedText('一\n\n⟦2⟧ 二', [mentionAnchor, link, hashtag]);

    expect(html).toBe(`<p>一</p><p>${link} 二 ${mentionAnchor} ${hashtag}</p>`);
  });

  it('訳文が空でも欠けた印の <a> を段落にして返す', () => {
    expect(fromTranslatedText('', [link, hashtag])).toBe(`<p>${link} ${hashtag}</p>`);
  });

  it('訳文も anchors も空なら空文字を返す', () => {
    expect(fromTranslatedText('', [])).toBe('');
  });

  it('存在しない番号の印を除く', () => {
    expect(fromTranslatedText('a ⟦9⟧ b ⟦0⟧ c ⟦1⟧', [link])).toBe(`<p>a  b  c ${link}</p>`);
  });

  it('印だけの段落が存在しない番号で空になったら段落ごと除く', () => {
    expect(fromTranslatedText('一\n\n⟦5⟧\n\n二', [])).toBe('<p>一</p><p>二</p>');
  });

  it('印の中の空白を許す', () => {
    expect(fromTranslatedText('⟦ 1 ⟧', [link])).toBe(`<p>${link}</p>`);
  });

  it('toTranslationSource の結果をそのまま戻すと元のリンクと段落を保つ', () => {
    const source = toTranslationSource(`<p>${mention} hi<br>${link}</p><p>${hashtag}</p>`);

    expect(fromTranslatedText(source.text, source.anchors)).toBe(
      `<p>${mentionAnchor} hi<br>${link}</p><p>${hashtag}</p>`,
    );
  });
});

describe('truncateTranslationSource', () => {
  it('上限以下はそのまま返す', () => {
    const source = { text: 'a'.repeat(MAX_TRANSLATION_INPUT_CHARS), anchors: [] };

    expect(truncateTranslationSource(source)).toEqual({ source, truncated: false });
  });

  it('上限を超えたら 5,000 字で切る', () => {
    const result = truncateTranslationSource({ text: 'あ'.repeat(MAX_TRANSLATION_INPUT_CHARS + 1), anchors: [] });

    expect(result.truncated).toBe(true);
    expect(Array.from(result.source.text)).toHaveLength(MAX_TRANSLATION_INPUT_CHARS);
  });

  it('切り口の途中の印を除き、切り取られた範囲の anchors を落とす', () => {
    const text = `⟦1⟧${'a'.repeat(MAX_TRANSLATION_INPUT_CHARS - 5)}⟦2⟧⟦3⟧`;

    const result = truncateTranslationSource({ text, anchors: [link, hashtag, mentionAnchor] });

    expect(result.truncated).toBe(true);
    expect(result.source.text.endsWith('⟦2')).toBe(false);
    expect(result.source.text.endsWith('a')).toBe(true);
    expect(result.source.anchors).toEqual([link]);
  });

  it('上限を指定できる', () => {
    expect(truncateTranslationSource({ text: 'abcdef', anchors: [] }, 3)).toEqual({
      source: { text: 'abc', anchors: [] },
      truncated: true,
    });
  });
});

describe('withTruncationNotice', () => {
  it('訳文の HTML の末尾に（以下省略）の段落を足す', () => {
    expect(withTruncationNotice('<p>訳</p>')).toBe(`<p>訳</p><p>${TRUNCATION_NOTICE}</p>`);
    expect(TRUNCATION_NOTICE).toBe('（以下省略）');
  });
});
