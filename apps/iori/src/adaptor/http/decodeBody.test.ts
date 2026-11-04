import { describe, expect, it } from 'vitest';

import { decodeBody } from './decodeBody.ts';

const ascii = (text: string): number[] => Array.from(new TextEncoder().encode(text));
const bytesOf = (...parts: (string | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => typeof part === 'string' ? ascii(part) : part));

const NIHONGO_SJIS = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];
const NIHONGO_EUC_JP = [0xC6, 0xFC, 0xCB, 0xDC, 0xB8, 0xEC];

describe('decodeBody charset from Content-Type', () => {
  it.each([
    'text/html; charset=Shift_JIS',
    'text/html; CHARSET="shift_jis"',
    'text/plain;charset=\'Shift_JIS\'',
  ])('decodes Shift_JIS with %s', (contentType) => {
    expect(decodeBody(Uint8Array.from(NIHONGO_SJIS), contentType)).toBe('日本語');
  });

  it('prefers the Content-Type charset over a meta charset', () => {
    const body = bytesOf('<meta charset="utf-8">', NIHONGO_SJIS);
    expect(decodeBody(body, 'text/html; charset=shift_jis')).toBe('<meta charset="utf-8">日本語');
  });

  it('decodes EUC-JP', () => {
    expect(decodeBody(Uint8Array.from(NIHONGO_EUC_JP), 'text/html; charset=EUC-JP')).toBe('日本語');
  });
});

describe('decodeBody charset from meta', () => {
  it('reads <meta charset> when Content-Type has no charset', () => {
    const body = bytesOf('<html><head><meta charset="Shift_JIS"><title>', NIHONGO_SJIS, '</title>');
    expect(decodeBody(body, 'text/html')).toBe('<html><head><meta charset="Shift_JIS"><title>日本語</title>');
  });

  it('reads <meta charset> when Content-Type is missing', () => {
    const body = bytesOf('<meta charset=shift_jis>', NIHONGO_SJIS);
    expect(decodeBody(body, null)).toBe('<meta charset=shift_jis>日本語');
  });

  it('reads <meta http-equiv="Content-Type" content="...; charset=...">', () => {
    const body = bytesOf(
      '<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=shift_jis"><TITLE>',
      NIHONGO_SJIS,
      '</TITLE>',
    );
    expect(decodeBody(body, 'text/html')).toContain('<TITLE>日本語</TITLE>');
  });

  it('accepts content before http-equiv and single quotes', () => {
    const body = bytesOf('<meta content=\'text/html; charset=EUC-JP\' http-equiv=\'content-type\'>', NIHONGO_EUC_JP);
    expect(decodeBody(body, 'application/xhtml+xml')).toContain('>日本語');
  });

  it('ignores meta charset beyond the first 1024 bytes', () => {
    const body = bytesOf(' '.repeat(1100), '<meta charset="shift_jis">', NIHONGO_SJIS);
    expect(decodeBody(body, 'text/html')).toContain('�');
  });

  it('ignores meta charset for non-HTML media types', () => {
    const body = bytesOf('<meta charset="shift_jis">', NIHONGO_SJIS);
    expect(decodeBody(body, 'application/rss+xml')).toContain('�');
  });

  it('treats a utf-16 meta charset as utf-8', () => {
    const body = bytesOf('<meta charset="utf-16le">', ascii('日本語'));
    expect(decodeBody(body, 'text/html')).toBe('<meta charset="utf-16le">日本語');
  });
});

describe('decodeBody fallbacks', () => {
  it('strips a UTF-8 BOM', () => {
    expect(decodeBody(bytesOf([0xEF, 0xBB, 0xBF], ascii('日本語')), 'text/html; charset=shift_jis')).toBe('日本語');
  });

  it.each([
    ['UTF-16LE', [0xFF, 0xFE, 0xE5, 0x65, 0x2C, 0x67, 0x9E, 0x8A]],
    ['UTF-16BE', [0xFE, 0xFF, 0x65, 0xE5, 0x67, 0x2C, 0x8A, 0x9E]],
  ])('decodes a %s BOM', (_name, bytes) => {
    expect(decodeBody(Uint8Array.from(bytes), 'text/html')).toBe('日本語');
  });

  it('decodes UTF-8 when nothing is specified', () => {
    expect(decodeBody(bytesOf(ascii('日本語')), null)).toBe('日本語');
    expect(decodeBody(bytesOf(ascii('日本語')), undefined)).toBe('日本語');
  });

  it('reads the meta charset when the Content-Type charset is unknown', () => {
    const body = bytesOf('<meta charset="Shift_JIS">', NIHONGO_SJIS);
    expect(decodeBody(body, 'text/html; charset=no-such-charset')).toBe('<meta charset="Shift_JIS">日本語');
  });

  it('falls back to utf-8 when both the Content-Type charset and the meta charset are unknown', () => {
    const body = bytesOf('<meta charset="no-such-charset">', ascii('日本語'));
    expect(decodeBody(body, 'text/html; charset=no-such-charset')).toBe('<meta charset="no-such-charset">日本語');
  });

  it('falls back to utf-8 when only the Content-Type charset is unknown and there is no meta', () => {
    expect(decodeBody(bytesOf(ascii('日本語')), 'text/html; charset=no-such-charset')).toBe('日本語');
  });

  it('falls back to utf-8 when only the meta charset is unknown', () => {
    const body = bytesOf('<meta charset="no-such-charset">', ascii('日本語'));
    expect(decodeBody(body, 'text/html')).toBe('<meta charset="no-such-charset">日本語');
  });
});
