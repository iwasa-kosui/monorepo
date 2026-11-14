import { describe, expect, it } from 'vitest';

import { XUsername } from './xUsername.ts';

describe('XUsername', () => {
  it('プロフィール URL は小文字で作り、ユーザー名に戻せる', () => {
    const username = XUsername.orThrow('Kosui_Iwasa');
    expect(XUsername.toProfileUrl(username)).toBe('https://x.com/kosui_iwasa');
    expect(XUsername.fromProfileUrl('https://x.com/kosui_iwasa')).toBe('kosui_iwasa');
  });

  it.each(['https://x.com/', 'https://x.com/a/b', 'not a url'])('%s からはユーザー名を取り出せない', (url) => {
    expect(XUsername.fromProfileUrl(url)).toBeUndefined();
  });
});
