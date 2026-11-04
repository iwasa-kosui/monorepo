import { describe, expect, it } from 'vitest';

import { decodeBody } from '../src/adaptor/http/decodeBody.ts';

const NIHONGO_SJIS = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];
const NIHONGO_EUC_JP = [0xC6, 0xFC, 0xCB, 0xDC, 0xB8, 0xEC];

describe('TextDecoder の日本語レガシー文字コード（workerd）', () => {
  it('shift_jis で「日本語」にデコードする', () => {
    expect(new TextDecoder('shift_jis').decode(Uint8Array.from(NIHONGO_SJIS))).toBe('日本語');
  });

  it('euc-jp で「日本語」にデコードする', () => {
    expect(new TextDecoder('euc-jp').decode(Uint8Array.from(NIHONGO_EUC_JP))).toBe('日本語');
  });

  it('decodeBody が Content-Type の charset で Shift_JIS と EUC-JP を読む', () => {
    expect(decodeBody(Uint8Array.from(NIHONGO_SJIS), 'text/html; charset=Shift_JIS')).toBe('日本語');
    expect(decodeBody(Uint8Array.from(NIHONGO_EUC_JP), 'text/html; charset=EUC-JP')).toBe('日本語');
  });
});
