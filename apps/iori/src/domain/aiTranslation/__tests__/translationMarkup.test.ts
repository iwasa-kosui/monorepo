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

const single = (anchors: ReadonlyArray<string> = []) => ({
  anchors,
  paragraphs: [{ kind: 'translate' }] as const,
});

describe('toTranslationSource', () => {
  it('リンク、メンション、ハッシュタグを順に印へ置き換え、元の <a> 要素を配列に入れる', () => {
    const source = toTranslationSource(`<p>${mention} Look ${link} ${hashtag}</p>`);

    expect(source.text).toBe('⟪1⟫ ⟦1⟧ Look ⟦2⟧ ⟦3⟧');
    expect(source.anchors).toEqual([mentionAnchor, link, hashtag]);
  });

  it('段落ごとに先頭へ ⟪n⟫ の印を付けて空行でつなぎ、<br> は段落内の改行にする', () => {
    expect(toTranslationSource('<p>one<br>two</p><p>three</p>').text).toBe('⟪1⟫ one\ntwo\n\n⟪2⟫ three');
    expect(toTranslationSource('<p>one<br/>two<BR />three</p>').text).toBe('⟪1⟫ one\ntwo\nthree');
  });

  it('段落の配列は訳す段落の数だけ translate を持つ', () => {
    expect(toTranslationSource('<p>one</p><p>two</p>').paragraphs).toEqual([
      { kind: 'translate' },
      { kind: 'translate' },
    ]);
  });

  it('空の段落は数えない', () => {
    expect(toTranslationSource('<p>one</p><p></p><p>two</p>').text).toBe('⟪1⟫ one\n\n⟪2⟫ two');
  });

  it('「RE: <a>」の段落と <a> だけの段落は残す段落にして、AI に渡す文と anchors に入れない', () => {
    const source = toTranslationSource(`<p>RE: ${link}</p><p>Hello</p><p>${hashtag}</p><p>Bye ${mention}</p>`);

    expect(source.text).toBe('⟪1⟫ Hello\n\n⟪2⟫ Bye ⟦1⟧');
    expect(source.anchors).toEqual([mentionAnchor]);
    expect(source.paragraphs).toEqual([
      { kind: 'keep', html: `RE: ${link}` },
      { kind: 'translate' },
      { kind: 'keep', html: hashtag },
      { kind: 'translate' },
    ]);
  });

  it('QT: も大文字小文字を区別せずに残す段落にする', () => {
    const source = toTranslationSource(`<p>Hi</p><p>qt: ${link}</p>`);

    expect(source.text).toBe('⟪1⟫ Hi');
    expect(source.paragraphs).toEqual([{ kind: 'translate' }, { kind: 'keep', html: `qt: ${link}` }]);
  });

  it('<a> 以外の語がある段落は残す段落にしない', () => {
    const source = toTranslationSource(`<p>RE: look at ${link}</p><p>Read ${link}</p>`);

    expect(source.text).toBe('⟪1⟫ RE: look at ⟦1⟧\n\n⟪2⟫ Read ⟦2⟧');
    expect(source.paragraphs).toEqual([{ kind: 'translate' }, { kind: 'translate' }]);
  });

  it('リンクだけの投稿は訳す段落を持たない', () => {
    const source = toTranslationSource(`<p>RE: ${link}</p>`);

    expect(source.text).toBe('');
    expect(source.paragraphs).toEqual([{ kind: 'keep', html: `RE: ${link}` }]);
  });

  it('ほかのタグを除き、HTML エンティティを平文に戻す', () => {
    expect(
      toTranslationSource('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; <strong>f</strong> &#x1F600;</p>').text,
    )
      .toBe('⟪1⟫ a & b <c> "d" \'e\' f 😀');
  });

  it('script と style の中身は残さない', () => {
    expect(toTranslationSource('<p>a<script>alert(1)</script><style>p{}</style>b</p>').text).toBe('⟪1⟫ ab');
  });

  it('印のない平文は anchors を空にする', () => {
    expect(toTranslationSource('<p>plain</p>')).toEqual({
      text: '⟪1⟫ plain',
      anchors: [],
      paragraphs: [{ kind: 'translate' }],
    });
  });

  it('空の本文は空の平文にする', () => {
    expect(toTranslationSource('')).toEqual({ text: '', anchors: [], paragraphs: [] });
  });
});

describe('fromTranslatedText', () => {
  it('印を元の <a> 要素に戻す', () => {
    const html = fromTranslatedText('⟦1⟧ さん、⟦2⟧ を見て ⟦3⟧', single([mentionAnchor, link, hashtag]));

    expect(html).toBe(`<p>${mentionAnchor} さん、${link} を見て ${hashtag}</p>`);
  });

  it('訳文を HTML エスケープする', () => {
    expect(fromTranslatedText('<script>alert("x")</script> & \'y\'', single())).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>',
    );
  });

  it('空行で段落を分け、段落内の改行を <br> にする', () => {
    expect(fromTranslatedText('一\n二\n\n三', single())).toBe('<p>一<br>二</p><p>三</p>');
  });

  it('CRLF と空白だけの行も段落の区切りとして扱う', () => {
    expect(fromTranslatedText('一\r\n  \r\n二', single())).toBe('<p>一</p><p>二</p>');
  });

  it('訳文から欠けた印の <a> を、最後の段落の末尾に空白区切りで足す', () => {
    const html = fromTranslatedText('一\n\n⟦2⟧ 二', single([mentionAnchor, link, hashtag]));

    expect(html).toBe(`<p>一</p><p>${link} 二 ${mentionAnchor} ${hashtag}</p>`);
  });

  it('訳文が空でも欠けた印の <a> を段落にして返す', () => {
    expect(fromTranslatedText('', single([link, hashtag]))).toBe(`<p>${link} ${hashtag}</p>`);
  });

  it('訳文も anchors も空なら空文字を返す', () => {
    expect(fromTranslatedText('', single())).toBe('');
  });

  it('存在しない番号の印を除く', () => {
    expect(fromTranslatedText('a ⟦9⟧ b ⟦0⟧ c ⟦1⟧', single([link]))).toBe(`<p>a  b  c ${link}</p>`);
  });

  it('印だけの段落が存在しない番号で空になったら段落ごと除く', () => {
    expect(fromTranslatedText('一\n\n⟦5⟧\n\n二', single())).toBe('<p>一</p><p>二</p>');
  });

  it('印の中の空白を許す', () => {
    expect(fromTranslatedText('⟦ 1 ⟧', single([link]))).toBe(`<p>${link}</p>`);
  });

  it('リンクの印が全角数字でも元の <a> に戻す', () => {
    expect(fromTranslatedText('⟦１⟧ を見て', single([link]))).toBe(`<p>${link} を見て</p>`);
  });

  it('toTranslationSource の結果をそのまま戻すと元のリンクと段落を保つ', () => {
    const source = toTranslationSource(`<p>${mention} hi<br>${link}</p><p>${hashtag}</p>`);

    expect(fromTranslatedText(source.text, source)).toBe(
      `<p>${mentionAnchor} hi<br>${link}</p><p>${hashtag}</p>`,
    );
  });
});

describe('fromTranslatedText の段落の印', () => {
  const three = toTranslationSource('<p>one</p><p>two</p><p>three</p>');

  it('AI が空行を潰しても、⟪n⟫ の印で段落に分ける', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n⟪2⟫ 二 ⟪3⟫ 三', three)).toBe('<p>一</p><p>二</p><p>三</p>');
  });

  it('印の中の空白を許す', () => {
    expect(fromTranslatedText('⟪ 1 ⟫ 一\n\n⟪ 2 ⟫ 二\n\n⟪3⟫ 三', three)).toBe('<p>一</p><p>二</p><p>三</p>');
  });

  it('印の後ろの段落内の改行は <br> にする', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n二\n\n⟪2⟫ 三\n\n⟪3⟫ 四', three)).toBe('<p>一<br>二</p><p>三</p><p>四</p>');
  });

  it('印が欠けたときは印を除いた全文を空行で分ける', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n\n二\n\n⟪3⟫ 三', three)).toBe('<p>一</p><p>二</p><p>三</p>');
  });

  it('印の番号が重複するか順番が違うときも空行で分ける', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n\n⟪1⟫ 二\n\n⟪3⟫ 三', three)).toBe('<p>一</p><p>二</p><p>三</p>');
    expect(fromTranslatedText('⟪2⟫ 二\n\n⟪1⟫ 一\n\n⟪3⟫ 三', three)).toBe('<p>二</p><p>一</p><p>三</p>');
  });

  it('余分な番号の印があるときは印をそろえずに、印の位置と空行で分ける', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n⟪2⟫ 二\n⟪3⟫ 三\n⟪4⟫ 四', three)).toBe('<p>一</p><p>二</p><p>三</p><p>四</p>');
  });

  it('印が揃わず切り替えたとき、段落の間が1つの改行でも印の位置で段落が分かれる', () => {
    expect(fromTranslatedText('⟪1⟫ 一\n⟪1⟫ 二\n⟪3⟫ 三', three)).toBe('<p>一</p><p>二</p><p>三</p>');
  });

  it('段落の印が全角数字でも、印で段落に分ける', () => {
    const two = toTranslationSource('<p>one</p><p>two</p>');

    expect(fromTranslatedText('⟪１⟫ 一\n⟪２⟫ 二', two)).toBe('<p>一</p><p>二</p>');
  });

  it('印の前に文章があるときは空行で分ける', () => {
    expect(fromTranslatedText('前置き\n\n⟪1⟫ 一\n\n⟪2⟫ 二\n\n⟪3⟫ 三', three)).toBe(
      '<p>前置き</p><p>一</p><p>二</p><p>三</p>',
    );
  });

  it('AI の出力に含まれなくても、残す段落を元の位置に <p> で出す', () => {
    const source = toTranslationSource(`<p>RE: ${link}</p><p>Hello</p><p>${hashtag}</p><p>Bye</p>`);

    expect(fromTranslatedText('⟪1⟫ こんにちは\n⟪2⟫ さようなら', source)).toBe(
      `<p>RE: ${link}</p><p>こんにちは</p><p>${hashtag}</p><p>さようなら</p>`,
    );
  });

  it('印が欠けたとき、空行で分けた段落群は最初の訳す段落の位置にまとめて置く', () => {
    const source = toTranslationSource(`<p>QT: ${link}</p><p>Hello</p><p>Bye</p><p>${hashtag}</p>`);

    expect(fromTranslatedText('こんにちは\n\nさようなら', source)).toBe(
      `<p>QT: ${link}</p><p>こんにちは</p><p>さようなら</p><p>${hashtag}</p>`,
    );
  });

  it('残す段落の <a> は欠けた <a> の付け足しの対象にせず、訳す段落の <a> だけを最後の訳す段落に足す', () => {
    const source = toTranslationSource(`<p>Hi ${mention}</p><p>RE: ${link}</p><p>Bye ${hashtag}</p><p>${link}</p>`);

    expect(source.anchors).toEqual([mentionAnchor, hashtag]);
    expect(fromTranslatedText('⟪1⟫ やあ\n⟪2⟫ ばいばい', source)).toBe(
      `<p>やあ</p><p>RE: ${link}</p><p>ばいばい ${mentionAnchor} ${hashtag}</p><p>${link}</p>`,
    );
  });

  it('残す段落の <a> のエスケープと <br> は訳す段落と同じ規則にする', () => {
    const source = toTranslationSource(`<p>RE:<br>${link}</p><p>Hello</p>`);

    expect(fromTranslatedText('⟪1⟫ こんにちは', source)).toBe(`<p>RE:<br>${link}</p><p>こんにちは</p>`);
  });
});

describe('truncateTranslationSource', () => {
  it('上限以下はそのまま返す', () => {
    const source = { text: 'a'.repeat(MAX_TRANSLATION_INPUT_CHARS), ...single() };

    expect(truncateTranslationSource(source)).toEqual({ source, truncated: false });
  });

  it('上限を超えたら 5,000 字で切る', () => {
    const result = truncateTranslationSource({ text: 'あ'.repeat(MAX_TRANSLATION_INPUT_CHARS + 1), ...single() });

    expect(result.truncated).toBe(true);
    expect(Array.from(result.source.text)).toHaveLength(MAX_TRANSLATION_INPUT_CHARS);
  });

  it('切り口の途中の印を除き、切り取られた範囲の anchors を落とす', () => {
    const text = `⟦1⟧${'a'.repeat(MAX_TRANSLATION_INPUT_CHARS - 5)}⟦2⟧⟦3⟧`;

    const result = truncateTranslationSource({ text, ...single([link, hashtag, mentionAnchor]) });

    expect(result.truncated).toBe(true);
    expect(result.source.text.endsWith('⟦2')).toBe(false);
    expect(result.source.text.endsWith('a')).toBe(true);
    expect(result.source.anchors).toEqual([link]);
  });

  it('切り口に残る途中の ⟪数字 を除く', () => {
    const text = `⟪1⟫ ${'a'.repeat(MAX_TRANSLATION_INPUT_CHARS - 9)}\n\n⟪12⟫ b`;

    const result = truncateTranslationSource({ text, anchors: [], paragraphs: [{ kind: 'translate' }] });

    expect(result.truncated).toBe(true);
    expect(result.source.text.endsWith('a')).toBe(true);
    expect(result.source.text.match(/⟪/g)).toHaveLength(1);
  });

  it('切り口より後ろの訳す段落と残す段落を落とし、anchors を切った後の内容に合わせる', () => {
    const source = toTranslationSource(
      `<p>RE: ${link}</p><p>${'a'.repeat(30)} ${mention}</p><p>${hashtag}</p><p>${'b'.repeat(30)} ${link}</p>`,
    );

    const result = truncateTranslationSource(source, 20);

    expect(result.truncated).toBe(true);
    expect(result.source.text).toBe(`⟪1⟫ ${'a'.repeat(16)}`);
    expect(result.source.anchors).toEqual([]);
    expect(result.source.paragraphs).toEqual([{ kind: 'keep', html: `RE: ${link}` }, { kind: 'translate' }]);
  });

  it('切り口の手前までの訳す段落と、その間の残す段落を保つ', () => {
    const source = toTranslationSource(`<p>one ${mention}</p><p>${hashtag}</p><p>${'b'.repeat(40)}</p><p>three</p>`);

    const result = truncateTranslationSource(source, 35);

    expect(result.source.anchors).toEqual([mentionAnchor]);
    expect(result.source.paragraphs).toEqual([
      { kind: 'translate' },
      { kind: 'keep', html: hashtag },
      { kind: 'translate' },
    ]);
  });

  it('上限を指定できる', () => {
    expect(truncateTranslationSource({ text: 'abcdef', ...single() }, 3)).toEqual({
      source: { text: 'abc', anchors: [], paragraphs: [] },
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
