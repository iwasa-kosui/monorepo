import { describe, expect, it } from 'vitest';

import { findDigestItemBlock, normalizeDeepDiveOutput, replaceDigestItemBlock } from './digestItemBlock.ts';

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

describe('normalizeDeepDiveOutput', () => {
  const url = 'https://example.com/a';
  const other = 'https://example.com/b';
  const linkLine = `- [A](${url})  `;
  const normalize = (output: string, options: { maxChars?: number } = {}) =>
    normalizeDeepDiveOutput(output, { url, linkLine, otherUrls: [other], maxChars: options.maxChars ?? 6_000 });

  it('項目のリンクを含むかたまりだけを使い、前後を捨てる', () => {
    const result = normalize(`前置き\n\n- [A](${url})\n  本文\n\n後書き`);

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  本文` });
  });

  it('項目のリンクが無ければ、元のリンク行を先頭に足して同じ検査をする', () => {
    const result = normalize('  \n本文 1\n本文 2\n');

    expect(result).toEqual({ ok: true, val: `- [A](${url})  \n  本文 1\n  本文 2` });
  });

  it('リンクが無く、先頭に足したリンク行の後に本文が続かなければ失敗する', () => {
    expect(normalize('   ')).toMatchObject({ ok: false });
  });

  it('かたまりの中に見出しの行があれば失敗する', () => {
    const result = normalize(`- [A](${url})\n    # 見出し\n    本文`);

    expect(result).toMatchObject({ ok: false, err: { reason: expect.stringContaining('heading') } });
  });

  it('かたまりの外にある見出しの行は、見出しから後ろを捨てる', () => {
    const result = normalize(`- [A](${url})\n  本文\n## 見出し\n後ろ`);

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  本文` });
  });

  it('2 行目以降でインデントの無い行には半角スペース 2 つを足し、空行とインデントのある行は変えない', () => {
    const result = normalize(`- [A](${url})\n本文 1\n\n  本文 2\n    本文 3`);

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  本文 1\n\n  本文 2\n    本文 3` });
  });

  it('2 行目以降に同じダイジェストのほかの項目へのリスト項目のリンクがあれば失敗する', () => {
    const result = normalize(`- [A](${url})\n  本文\n  - [B](${other})`);

    expect(result).toMatchObject({ ok: false, err: { reason: expect.stringContaining('another item') } });
  });

  it('ほかの項目の URL でも、リスト項目でない本文中のリンクは失敗にしない', () => {
    const result = normalize(`- [A](${url})\n  参考 [B](${other})`);

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  参考 [B](${other})` });
  });

  it('リンク行を除いた本文が空なら失敗する', () => {
    expect(normalize(`- [A](${url})`)).toMatchObject({
      ok: false,
      err: { reason: expect.stringContaining('no body') },
    });
    expect(normalize(`- [A](${url})\n   \n`)).toMatchObject({ ok: false });
  });

  it('Markdown の画像をすべて取り除き、画像だけの行は行ごと消す', () => {
    const result = normalize(`- [A](${url})\n  ![図](https://img.example/x.png)\n  本文 ![b](c) 続き\n  ![d](e)`);

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  本文  続き` });
  });

  it('上限を超えるときは、行の境目で切り、行の途中では切らない', () => {
    const result = normalize(`- [A](${url})\n  あいうえお\n  かきくけこ\n  さしすせそ`, {
      maxChars: `- [A](${url})\n  あいうえお\n  かきくけ`.length,
    });

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  あいうえお` });
  });

  it('上限の文字数はコードポイントで数える', () => {
    const result = normalize(`- [A](${url})\n  😀😀😀\n  😀😀😀`, { maxChars: `- [A](${url})\n  😀😀😀`.length - 3 });

    expect(result).toEqual({ ok: true, val: `- [A](${url})\n  😀😀😀` });
  });

  it('1 行目の後の最初の行だけで上限を超えて本文が残らなければ失敗する', () => {
    const result = normalize(`- [A](${url})\n  ${'あ'.repeat(100)}`, { maxChars: 50 });

    expect(result).toMatchObject({ ok: false, err: { reason: expect.stringContaining('no body') } });
  });
});
