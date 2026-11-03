import { describe, expect, it } from 'vitest';

import { parseTranslationOutput } from '../translationOutput.ts';

describe('parseTranslationOutput', () => {
  it('1 行目の [[lang:xx]] を原文の言語として読み、2 行目から訳文にする', () => {
    expect(parseTranslationOutput('[[lang:en]]\nこんにちは\n\n世界')).toEqual({
      detectedSourceLanguage: 'en',
      text: 'こんにちは\n\n世界',
    });
  });

  it('言語コードは小文字にそろえる', () => {
    expect(parseTranslationOutput('[[lang:EN]]\nはい').detectedSourceLanguage).toBe('en');
  });

  it('先頭の空白と [[lang:xx]] の後ろの空白を許す', () => {
    expect(parseTranslationOutput('  [[lang:fr]]  \nはい')).toEqual({ detectedSourceLanguage: 'fr', text: 'はい' });
  });

  it('[[lang:xx]] と同じ行に訳文が続いていても読む', () => {
    expect(parseTranslationOutput('[[lang:en]] こんにちは')).toEqual({
      detectedSourceLanguage: 'en',
      text: 'こんにちは',
    });
  });

  it('1 行目が読めないときは und にして全体を訳文にする', () => {
    expect(parseTranslationOutput('こんにちは\n世界')).toEqual({
      detectedSourceLanguage: 'und',
      text: 'こんにちは\n世界',
    });
  });

  it('[[lang:xx]] が 2 行目以降にあるときは読まない', () => {
    expect(parseTranslationOutput('はい\n[[lang:en]]\nいいえ').detectedSourceLanguage).toBe('und');
  });

  it('言語コードの形が違うときは und にする', () => {
    expect(parseTranslationOutput('[[lang:english]]\nはい').detectedSourceLanguage).toBe('und');
  });

  it('訳文がないときは空の訳文にする', () => {
    expect(parseTranslationOutput('[[lang:en]]')).toEqual({ detectedSourceLanguage: 'en', text: '' });
  });
});
