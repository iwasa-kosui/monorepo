import { NOTIFICATION_TYPES, requestUrl } from './mastodonClient.ts';

export const NOTIFICATION_BADGE_SELECTOR = '[data-notification-badge]';

export const NOTIFICATION_BADGE_MAX = 99;

export const unreadNotificationCountUrl = (): string =>
  requestUrl('/api/v1/notifications/unread_count', { 'types[]': NOTIFICATION_TYPES });

export const formatNotificationBadge = (count: number): string | undefined => {
  if (!Number.isFinite(count) || count <= 0) return undefined;
  return count > NOTIFICATION_BADGE_MAX ? `${NOTIFICATION_BADGE_MAX}+` : String(Math.floor(count));
};

export const fetchUnreadNotificationCount = async (fetcher: typeof fetch): Promise<number | undefined> => {
  try {
    const res = await fetcher(unreadNotificationCountUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || !('count' in body)) return undefined;
    return typeof body.count === 'number' ? body.count : undefined;
  } catch {
    return undefined;
  }
};

export const applyNotificationBadge = (root: ParentNode, count: number): void => {
  const label = formatNotificationBadge(count);
  root.querySelectorAll<HTMLElement>(NOTIFICATION_BADGE_SELECTOR).forEach((badge) => {
    badge.textContent = label ?? '';
    badge.hidden = label === undefined;
  });
};
