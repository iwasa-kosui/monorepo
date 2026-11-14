import { describe, expect, it } from 'vitest';

import { remoteSearchUrl } from './searchRemoteUrl.ts';

const OWN_HOST = 'iori.test';

describe('remoteSearchUrl', () => {
  it('自分のサーバー以外の https の URL をそのまま返す', () => {
    expect(remoteSearchUrl('https://remote.example/@alice/123', OWN_HOST)).toBe('https://remote.example/@alice/123');
    expect(remoteSearchUrl('https://remote.example/notes/abc', OWN_HOST)).toBe('https://remote.example/notes/abc');
  });

  it('前後の空白を取り除いて返す', () => {
    expect(remoteSearchUrl('  https://remote.example/@alice/123 \n', OWN_HOST)).toBe(
      'https://remote.example/@alice/123',
    );
  });

  it('自分のサーバーの URL は、ホスト名の大文字小文字が違っても返さない', () => {
    expect(remoteSearchUrl('https://iori.test/posts/abc', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('https://IORI.test/posts/abc', OWN_HOST)).toBeUndefined();
  });

  it('http の URL、https 以外の URL、URL でない入力は返さない', () => {
    expect(remoteSearchUrl('http://remote.example/@alice/123', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('ftp://remote.example/@alice/123', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('京都 旅行', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('@alice@remote.example', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('', OWN_HOST)).toBeUndefined();
  });

  it('空白を含む入力と、ユーザー情報付きの URL は返さない', () => {
    expect(remoteSearchUrl('https://remote.example/@alice 123', OWN_HOST)).toBeUndefined();
    expect(remoteSearchUrl('https://user:pw@remote.example/@alice/123', OWN_HOST)).toBeUndefined();
  });

  it('URL として解釈できない入力は返さない', () => {
    expect(remoteSearchUrl('https://', OWN_HOST)).toBeUndefined();
  });
});
