import { describe, expect, it, vi } from 'vitest';

import { applyMessageBadge, fetchUnreadMessageCount, MESSAGE_BADGE_SELECTOR } from './messageBadge.ts';
import { NOTIFICATION_BADGE_SELECTOR } from './notificationBadge.ts';

const fakeBadge = () => ({ textContent: 'stale', hidden: false });

const rootWith = (badges: ReturnType<typeof fakeBadge>[]) =>
  ({
    querySelectorAll: vi.fn((selector: string) => {
      expect(selector).toBe(MESSAGE_BADGE_SELECTOR);
      return { forEach: (callback: (badge: ReturnType<typeof fakeBadge>) => void) => badges.forEach(callback) };
    }),
  }) as unknown as ParentNode;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MESSAGE_BADGE_SELECTOR', () => {
  it('通知のバッジとは別の属性を指す', () => {
    expect(MESSAGE_BADGE_SELECTOR).toBe('[data-dm-badge]');
    expect(MESSAGE_BADGE_SELECTOR).not.toBe(NOTIFICATION_BADGE_SELECTOR);
  });
});

describe('fetchUnreadMessageCount', () => {
  it('未読の会話の数とリクエストの数の合計を、同じオリジンへの GET で取る', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ unread: 3, requests: 2 })));

    expect(await fetchUnreadMessageCount(fetcher)).toBe(5);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/iori/v1/bluesky/chat/unread_count',
      expect.objectContaining({ credentials: 'same-origin', method: 'GET' }),
    );
  });

  it('403 と 409 は unavailable にする', async () => {
    expect(await fetchUnreadMessageCount(() => Promise.resolve(jsonResponse({ error: 'chat_not_permitted' }, 403))))
      .toBe('unavailable');
    expect(await fetchUnreadMessageCount(() => Promise.resolve(jsonResponse({ error: 'disabled' }, 409))))
      .toBe('unavailable');
  });

  it('その他のエラー、壊れた本文、通信失敗は undefined にする', async () => {
    expect(await fetchUnreadMessageCount(() => Promise.resolve(jsonResponse({}, 502)))).toBeUndefined();
    expect(await fetchUnreadMessageCount(() => Promise.resolve(jsonResponse({ unread: '3', requests: 0 }))))
      .toBeUndefined();
    expect(await fetchUnreadMessageCount(() => Promise.resolve(jsonResponse({ unread: 1 })))).toBeUndefined();
    expect(await fetchUnreadMessageCount(() => Promise.reject(new Error('offline')))).toBeUndefined();
  });
});

describe('applyMessageBadge', () => {
  it('すべてのバッジに件数を出し、99 を超えたら 99+ にする', () => {
    const badges = [fakeBadge(), fakeBadge()];
    applyMessageBadge(rootWith(badges), 120);

    expect(badges).toEqual([{ textContent: '99+', hidden: false }, { textContent: '99+', hidden: false }]);
  });

  it('未読が無ければ隠して空にする', () => {
    const badges = [fakeBadge()];
    applyMessageBadge(rootWith(badges), 0);

    expect(badges).toEqual([{ textContent: '', hidden: true }]);
  });
});
