import { describe, expect, it } from 'vitest';

import { XUsername } from './xUsername.ts';

describe('XUsername', () => {
  it.each(['a', 'jack', 'Kosui_Iwasa', '_x_', '0123456789abcde'])('%s を受け付ける', (username) => {
    expect(XUsername.parse(username).ok).toBe(true);
  });

  it.each(['', '0123456789abcdef', 'with space', 'ハンドル', 'a-b', 'a.b', '@jack', 'jack/status'])(
    '%s は受け付けない',
    (username) => {
      expect(XUsername.parse(username).ok).toBe(false);
    },
  );

  it('プロフィール URL は小文字で作り、ユーザー名に戻せる', () => {
    const username = XUsername.orThrow('Kosui_Iwasa');
    expect(XUsername.toProfileUrl(username)).toBe('https://x.com/kosui_iwasa');
    expect(XUsername.fromProfileUrl('https://x.com/kosui_iwasa')).toBe('kosui_iwasa');
  });

  it('投稿の URL は https://x.com/<ユーザー名>/status/<投稿 ID> にする', () => {
    expect(XUsername.toStatusUrl(XUsername.orThrow('jack'), '20')).toBe('https://x.com/jack/status/20');
  });

  it.each(['https://x.com/', 'https://x.com/a/b', 'not a url'])('%s からはユーザー名を取り出せない', (url) => {
    expect(XUsername.fromProfileUrl(url)).toBeUndefined();
  });
});
