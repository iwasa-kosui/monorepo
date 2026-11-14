import { describe, expect, it } from 'vitest';

import { decodeBody } from '../src/adaptor/http/decodeBody.ts';

const NIHONGO_SJIS = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];
const NIHONGO_EUC_JP = [0xC6, 0xFC, 0xCB, 0xDC, 0xB8, 0xEC];

describe('TextDecoder の日本語レガシー文字コード（workerd）', () => {
  it('decodeBody が Content-Type の charset で Shift_JIS と EUC-JP を読む', () => {
    expect(decodeBody(Uint8Array.from(NIHONGO_SJIS), 'text/html; charset=Shift_JIS')).toBe('日本語');
    expect(decodeBody(Uint8Array.from(NIHONGO_EUC_JP), 'text/html; charset=EUC-JP')).toBe('日本語');
  });

  it('Content-Type に charset が無いとき meta charset の Shift_JIS を読む', () => {
    const body = Uint8Array.from([...new TextEncoder().encode('<meta charset="Shift_JIS">'), ...NIHONGO_SJIS]);
    expect(decodeBody(body, 'text/html')).toBe('<meta charset="Shift_JIS">日本語');
  });

  it('UTF-16LE の BOM 付き本文を読む', () => {
    expect(decodeBody(Uint8Array.from([0xFF, 0xFE, 0xE5, 0x65, 0x2C, 0x67, 0x9E, 0x8A]), 'text/html')).toBe('日本語');
  });

  it('UTF-16BE の BOM 付き本文を読む', () => {
    expect(decodeBody(Uint8Array.from([0xFE, 0xFF, 0x65, 0xE5, 0x67, 0x2C, 0x8A, 0x9E]), 'text/html')).toBe('日本語');
  });
});
