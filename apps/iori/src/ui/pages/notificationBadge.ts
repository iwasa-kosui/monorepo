import { applyMessageBadge, fetchUnreadMessageCount, MESSAGES_READ_EVENT } from '../api/messageBadge.ts';
import { readIsLoggedIn } from '../api/navPrefetch.ts';
import { applyNotificationBadge, fetchUnreadNotificationCount } from '../api/notificationBadge.ts';

const POLL_INTERVAL_MS = 60 * 1000;

if (globalThis.window && readIsLoggedIn(document)) {
  const isOnNotificationsPage = () => window.location.pathname === '/notifications';
  const refresh = async () => {
    if (isOnNotificationsPage()) {
      applyNotificationBadge(document, 0);
      return;
    }
    if (document.visibilityState !== 'visible') return;
    const count = await fetchUnreadNotificationCount((input, init) => fetch(input, init));
    if (count !== undefined) applyNotificationBadge(document, count);
  };
  void refresh();
  document.addEventListener('visibilitychange', () => void refresh());
  window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

  let messagesUnavailable = false;
  const refreshMessages = async () => {
    if (messagesUnavailable || document.visibilityState !== 'visible') return;
    const unread = await fetchUnreadMessageCount((input, init) => fetch(input, init));
    if (unread === 'unavailable') messagesUnavailable = true;
    applyMessageBadge(document, typeof unread === 'number' ? unread : 0);
  };
  void refreshMessages();
  document.addEventListener('visibilitychange', () => void refreshMessages());
  window.addEventListener(MESSAGES_READ_EVENT, () => void refreshMessages());
  window.setInterval(() => void refreshMessages(), POLL_INTERVAL_MS);
}
