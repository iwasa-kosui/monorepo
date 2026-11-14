import { describe, expect, it, vi } from 'vitest';

import {
  applyNotificationBadge,
  fetchUnreadNotificationCount,
  formatNotificationBadge,
  NOTIFICATION_BADGE_SELECTOR,
} from './notificationBadge.ts';

const fakeBadge = () => ({ textContent: 'stale', hidden: false });

const rootWith = (badges: ReturnType<typeof fakeBadge>[]) =>
  ({
    querySelectorAll: vi.fn((selector: string) => {
      expect(selector).toBe(NOTIFICATION_BADGE_SELECTOR);
      return { forEach: (callback: (badge: ReturnType<typeof fakeBadge>) => void) => badges.forEach(callback) };
    }),
  }) as unknown as ParentNode;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('formatNotificationBadge', () => {
  it('hides the badge when nothing is unread', () => {
    expect(formatNotificationBadge(0)).toBeUndefined();
    expect(formatNotificationBadge(-1)).toBeUndefined();
    expect(formatNotificationBadge(Number.NaN)).toBeUndefined();
  });

  it('shows the count and caps it at 99+', () => {
    expect(formatNotificationBadge(1)).toBe('1');
    expect(formatNotificationBadge(99)).toBe('99');
    expect(formatNotificationBadge(100)).toBe('99+');
  });
});

describe('fetchUnreadNotificationCount', () => {
  it('returns undefined for errors and malformed bodies', async () => {
    expect(await fetchUnreadNotificationCount(() => Promise.resolve(jsonResponse({}, 401)))).toBeUndefined();
    expect(await fetchUnreadNotificationCount(() => Promise.resolve(jsonResponse({ count: '3' })))).toBeUndefined();
    expect(await fetchUnreadNotificationCount(() => Promise.reject(new Error('offline')))).toBeUndefined();
  });
});

describe('applyNotificationBadge', () => {
  it('shows every badge with the formatted count', () => {
    const badges = [fakeBadge(), fakeBadge()];
    applyNotificationBadge(rootWith(badges), 120);

    expect(badges).toEqual([{ textContent: '99+', hidden: false }, { textContent: '99+', hidden: false }]);
  });

  it('hides and clears every badge when nothing is unread', () => {
    const badges = [fakeBadge()];
    applyNotificationBadge(rootWith(badges), 0);

    expect(badges).toEqual([{ textContent: '', hidden: true }]);
  });
});
