import { describe, expect, it } from 'vitest';

import { RedirectUri } from '../redirectUri.ts';

describe('RedirectUri', () => {
  it.each([
    'https://app.example/callback',
    'http://localhost:8080/cb?x=1',
    'ivory://oauth/callback',
    'com.tapbots.ivory:/oauth',
    'urn:ietf:wg:oauth:2.0:oob',
  ])('%s を受け付ける', (value) => {
    expect(RedirectUri.parse(value)).toMatchObject({ ok: true, val: value });
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>1</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relative/path',
    'not a uri',
    '',
    'https://app.example/cb#fragment',
  ])('%s を拒む', (value) => {
    expect(RedirectUri.parse(value)).toMatchObject({ ok: false });
  });

  it('2000 文字を超える値を拒む', () => {
    const base = 'https://app.example/';
    expect(RedirectUri.parse(base + 'a'.repeat(2000 - base.length))).toMatchObject({ ok: true });
    expect(RedirectUri.parse(base + 'a'.repeat(2001 - base.length))).toMatchObject({ ok: false });
  });

  describe('parseList', () => {
    it('文字列の改行区切りを分ける', () => {
      const result = RedirectUri.parseList('https://a.example/cb\r\nivory://cb\n\n');
      expect(result).toMatchObject({ ok: true, val: ['https://a.example/cb', 'ivory://cb'] });
    });

    it('配列を受け付け、重複を除く', () => {
      const result = RedirectUri.parseList(['https://a.example/cb', 'https://a.example/cb']);
      expect(result).toMatchObject({ ok: true, val: ['https://a.example/cb'] });
    });

    it('空、未指定、不正な値を拒む', () => {
      expect(RedirectUri.parseList(undefined)).toMatchObject({ ok: false });
      expect(RedirectUri.parseList('  \n ')).toMatchObject({ ok: false });
      expect(RedirectUri.parseList(['https://a.example/cb', 'javascript:alert(1)'])).toMatchObject({ ok: false });
      expect(RedirectUri.parseList([1])).toMatchObject({ ok: false });
    });
  });
});
