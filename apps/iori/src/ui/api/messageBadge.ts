import { unreadMessageCountUrl } from './blueskyChatClient.ts';
import { formatNotificationBadge } from './notificationBadge.ts';

export const MESSAGE_BADGE_SELECTOR = '[data-dm-badge]';

export const MESSAGES_READ_EVENT = 'iori:messages-read';

export type UnreadMessages = number | 'unavailable' | undefined;

export const fetchUnreadMessageCount = async (fetcher: typeof fetch): Promise<UnreadMessages> => {
  try {
    const res = await fetcher(unreadMessageCountUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (res.status === 403 || res.status === 409) return 'unavailable';
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || !('unread' in body) || !('requests' in body)) return undefined;
    return typeof body.unread === 'number' && typeof body.requests === 'number'
      ? body.unread + body.requests
      : undefined;
  } catch {
    return undefined;
  }
};

export const applyMessageBadge = (root: ParentNode, count: number): void => {
  const label = formatNotificationBadge(count);
  root.querySelectorAll<HTMLElement>(MESSAGE_BADGE_SELECTOR).forEach((badge) => {
    badge.textContent = label ?? '';
    badge.hidden = label === undefined;
  });
};
