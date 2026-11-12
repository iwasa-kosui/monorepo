import { unreadMessageCountUrl } from './blueskyChatClient.ts';
import { unreadFediverseMessageCountUrl } from './fediverseConversationClient.ts';
import { formatNotificationBadge } from './notificationBadge.ts';

export const MESSAGE_BADGE_SELECTOR = '[data-dm-badge]';

export const MESSAGES_READ_EVENT = 'iori:messages-read';

export type UnreadMessages = number | 'unavailable' | undefined;

const fetchCount = async (
  fetcher: typeof fetch,
  url: string,
  countOf: (body: object) => number | undefined,
): Promise<UnreadMessages> => {
  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (res.status === 403 || res.status === 409) return 'unavailable';
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    return typeof body === 'object' && body !== null ? countOf(body) : undefined;
  } catch {
    return undefined;
  }
};

const blueskyCountOf = (body: object): number | undefined =>
  'unread' in body && 'requests' in body && typeof body.unread === 'number' && typeof body.requests === 'number'
    ? body.unread + body.requests
    : undefined;

const fediverseCountOf = (body: object): number | undefined =>
  'unread' in body && typeof body.unread === 'number' ? body.unread : undefined;

export const combineUnreadMessages = (sources: readonly UnreadMessages[]): UnreadMessages => {
  const counts = sources.filter((source): source is number => typeof source === 'number');
  if (counts.length > 0) return counts.reduce((sum, count) => sum + count, 0);
  return sources.every((source) => source === 'unavailable') ? 'unavailable' : undefined;
};

export const fetchUnreadMessageCount = async (fetcher: typeof fetch): Promise<UnreadMessages> =>
  combineUnreadMessages(
    await Promise.all([
      fetchCount(fetcher, unreadMessageCountUrl(), blueskyCountOf),
      fetchCount(fetcher, unreadFediverseMessageCountUrl(), fediverseCountOf),
    ]),
  );

export const applyMessageBadge = (root: ParentNode, count: number): void => {
  const label = formatNotificationBadge(count);
  root.querySelectorAll<HTMLElement>(MESSAGE_BADGE_SELECTOR).forEach((badge) => {
    badge.textContent = label ?? '';
    badge.hidden = label === undefined;
  });
};
