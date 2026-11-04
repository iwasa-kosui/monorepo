import { describe, expect, it } from 'vitest';

import { findDigestItemBlock, replaceDigestItemBlock } from './digestItemBlock.ts';

const markdown = [
  '## あなたへのおすすめ',
  '',
  '-   [A](https://example.com/a)  ',
  '    要約 A  ',
  '    関心の根拠: [kosui](https://example.com/k)',
  '-   [B](https://example.com/b)  ',
  '    要約 B',
  '-   [C](https://example.com/c)',
  '',
  '## みんなの関心',
  '',
  '-   [D](https://example.com/d)',
].join('\n');

describe('findDigestItemBlock', () => {
  it('その URL のリンクを含むリスト項目から、次の同じ深さのリスト項目の直前までを返す', () => {
    const block = findDigestItemBlock(markdown, 'https://example.com/a');

    expect(block?.text).toBe(
      '-   [A](https://example.com/a)  \n    要約 A  \n    関心の根拠: [kosui](https://example.com/k)',
    );
    expect(markdown.slice(block!.start, block!.end)).toBe(block!.text);
  });

  it('途中の項目は、前後の項目を含めずにその項目だけを返す', () => {
    const block = findDigestItemBlock(markdown, 'https://example.com/b');

    expect(block?.text).toBe('-   [B](https://example.com/b)  \n    要約 B');
  });

  it('最後の項目は、次の見出しと手前の空行を含めずに返す', () => {
    const block = findDigestItemBlock(markdown, 'https://example.com/c');

    expect(block?.text).toBe('-   [C](https://example.com/c)');
  });

  it('見出しが続かない末尾の項目は、本文の終わりまでを返す', () => {
    const block = findDigestItemBlock(markdown, 'https://example.com/d');

    expect(block?.text).toBe('-   [D](https://example.com/d)');
    expect(block?.end).toBe(markdown.length);
  });

  it('空行の後にインデントされた続きがあれば、同じ項目のかたまりに含める', () => {
    const loose = '- [A](https://example.com/a)\n\n  段落 1\n\n  段落 2\n- [B](https://example.com/b)';

    expect(findDigestItemBlock(loose, 'https://example.com/a')?.text).toBe(
      '- [A](https://example.com/a)\n\n  段落 1\n\n  段落 2',
    );
  });

  it('空行の後のインデントされていない行の直前で終わる', () => {
    const text = '- [A](https://example.com/a)\n  続き\n\n本文の段落';

    expect(findDigestItemBlock(text, 'https://example.com/a')?.text).toBe('- [A](https://example.com/a)\n  続き');
  });

  it('深い入れ子の項目は同じかたまりに含め、同じ深さの項目で終わる', () => {
    const nested = '- [A](https://example.com/a)\n  - 子 1\n  - 子 2\n- [B](https://example.com/b)';

    expect(findDigestItemBlock(nested, 'https://example.com/a')?.text).toBe(
      '- [A](https://example.com/a)\n  - 子 1\n  - 子 2',
    );
  });

  it('その URL が本文に無ければ undefined を返す', () => {
    expect(findDigestItemBlock(markdown, 'https://example.com/missing')).toBeUndefined();
  });

  it('URL がリスト項目でない行にしか無ければ undefined を返す', () => {
    expect(findDigestItemBlock('本文 [A](https://example.com/a)', 'https://example.com/a')).toBeUndefined();
  });

  it('同じ URL が 2 回あれば、最初の 1 つを返す', () => {
    const twice = '- [先](https://example.com/a)\n- [後](https://example.com/a)';

    expect(findDigestItemBlock(twice, 'https://example.com/a')?.text).toBe('- [先](https://example.com/a)');
  });

  it('URL の前方一致では見つけない', () => {
    expect(findDigestItemBlock('- [A](https://example.com/abc)', 'https://example.com/a')).toBeUndefined();
  });

  it('本文のリンクが URL を正規化した形（末尾のスラッシュ）でも見つける', () => {
    expect(findDigestItemBlock('- [A](https://example.com/)', 'https://example.com')?.text).toBe(
      '- [A](https://example.com/)',
    );
  });

  it('括弧を含む URL は、Markdown でエスケープされた形でも見つける', () => {
    expect(findDigestItemBlock('- [A](https://example.com/a\\(1\\))', 'https://example.com/a(1)')?.text).toBe(
      '- [A](https://example.com/a\\(1\\))',
    );
  });
});

describe('replaceDigestItemBlock', () => {
  it('かたまりだけを差し替え、前後の本文をそのまま残す', () => {
    const block = findDigestItemBlock(markdown, 'https://example.com/b')!;

    const replaced = replaceDigestItemBlock(markdown, block, '- [B](https://example.com/b)\n  深掘り');

    expect(replaced).toBe(
      markdown.replace('-   [B](https://example.com/b)  \n    要約 B', '- [B](https://example.com/b)\n  深掘り'),
    );
  });
});
