import { describe, expect, it } from 'vitest';

import { isHomeNavClickOnHome } from './homeNavClick.ts';

const click = (overrides: Partial<Parameters<typeof isHomeNavClickOnHome>[0]> = {}) =>
  isHomeNavClickOnHome({
    href: 'https://iori.example/',
    currentHref: 'https://iori.example/',
    button: 0,
    hasModifier: false,
    ...overrides,
  });

describe('isHomeNavClickOnHome', () => {
  it('ホームでホームボタンを押したときは、先頭へのスクロールに切り替える', () => {
    expect(click()).toBe(true);
  });

  it('ほかのナビのリンクは、そのまま遷移させる', () => {
    expect(click({ href: 'https://iori.example/notifications' })).toBe(false);
    expect(click({ href: 'https://iori.example/#post-modal' })).toBe(false);
    expect(click({ href: undefined })).toBe(false);
  });

  it('投稿モーダルを開いているときは、モーダルを閉じる既定の遷移を妨げない', () => {
    expect(click({ currentHref: 'https://iori.example/#post-modal' })).toBe(false);
  });

  it('新しいタブで開く操作は妨げない', () => {
    expect(click({ hasModifier: true })).toBe(false);
    expect(click({ button: 1 })).toBe(false);
  });

  it('別オリジンへのリンクは横取りしない', () => {
    expect(click({ href: 'https://other.example/' })).toBe(false);
  });
});
