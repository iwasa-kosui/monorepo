import {
  applyMessageBadge,
  initialMessagePolling,
  MESSAGES_READ_EVENT,
  pollUnreadMessages,
} from '../api/messageBadge.ts';
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
  let messagePolling = initialMessagePolling;
  const refreshMessages = async () => {
    if (messagesUnavailable || document.visibilityState !== 'visible') return;
    const polled = await pollUnreadMessages((input, init) => fetch(input, init), messagePolling);
    messagePolling = polled.polling;
    if (polled.unread === 'unavailable') messagesUnavailable = true;
    applyMessageBadge(document, typeof polled.unread === 'number' ? polled.unread : 0);
  };
  void refreshMessages();
  document.addEventListener('visibilitychange', () => void refreshMessages());
  window.addEventListener(MESSAGES_READ_EVENT, () => void refreshMessages());
  window.setInterval(() => void refreshMessages(), POLL_INTERVAL_MS);
}
