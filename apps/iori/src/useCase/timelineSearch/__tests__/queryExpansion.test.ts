import { describe, expect, it } from 'vitest';

import type { TextGenerator } from '../../../ports/textGenerator.ts';
import { expandQuery, parseExpandedTerms } from '../queryExpansion.ts';

const parsedValues = (output: string) => {
  const result = parseExpandedTerms(output);
  if (!result.ok) throw new Error(result.err.message);
  return result.val.map((term) => term.normalized);
};

describe('parseExpandedTerms', () => {
  it('JSON の配列を読む', () => {
    expect(parsedValues('["旅行", "trip"]')).toEqual(['旅行', 'trip']);
  });

  it('think のブロックを除く', () => {
    expect(parsedValues('<think>候補は ["x"] かもしれない\n考える</think>\n["旅行","トラベル"]')).toEqual([
      '旅行',
      'トラベル',
    ]);
  });

  it('閉じていない think のブロックは末尾まで除く', () => {
    const result = parseExpandedTerms('<think>["x"]');
    expect(result.ok).toBe(false);
  });

  it('開きタグのない </think> より前を捨てる', () => {
    expect(parsedValues('推論の中に [ と ] がある文</think>["語1","語2"]')).toEqual(['語1', '語2']);
  });

  it('最後の </think> より前を捨てる', () => {
    expect(parsedValues('["x"]</think>考える</think>["語1"]')).toEqual(['語1']);
  });

  it('コードフェンスを除く', () => {
    expect(parsedValues('```json\n["旅行", "トラベル"]\n```')).toEqual(['旅行', 'トラベル']);
    expect(parsedValues('```\n["ab"]\n```')).toEqual(['ab']);
  });

  it('配列の前後の説明を無視する', () => {
    expect(parsedValues('結果: ["ab", "cd"] 以上です')).toEqual(['ab', 'cd']);
  });

  it.each([
    ['配列がない出力', 'わかりません'],
    ['オブジェクト', '{"terms": "a"}'],
    ['JSON として壊れた配列', '["a", ]'],
    ['文字列でない要素を含む配列', '["a", 1]'],
    ['空の出力', ''],
  ])('%s は失敗にする', (_name, output) => {
    const result = parseExpandedTerms(output);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('QueryExpansionParseError');
  });

  it('不正な語を捨てる', () => {
    const output = JSON.stringify(['旅行', '', '100%', 'a_b', 'a\\b', 'a'.repeat(49), '  ＡＢＣ ', 'trip']);
    expect(parsedValues(output)).toEqual(['旅行', 'ABC', 'trip']);
  });

  it('NFKC 後に 1 文字の語を捨てる', () => {
    expect(parsedValues('["旅", "Ａ", "ab", "㌔"]')).toEqual(['ab', 'キロ']);
  });
});

describe('expandQuery', () => {
  it('期限を過ぎると QueryExpansionTimeoutError にする', async () => {
    const generator: TextGenerator = {
      summarize: () => new Promise(() => {}),
      generate: () => new Promise(() => {}),
    };
    const result = await expandQuery(generator, 'たび', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('QueryExpansionTimeoutError');
  });
});
