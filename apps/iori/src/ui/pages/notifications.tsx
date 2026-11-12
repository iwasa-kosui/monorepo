import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Notification } from '../../adaptor/mastodon/entities.ts';
import {
  fetchNotifications,
  fetchVerifyCredentials,
  isUnauthorizedError,
  markBlueskyNotificationsSeen,
  NOTIFICATION_TYPES,
  notificationsUrl,
  saveNotificationsMarker,
} from '../api/mastodonClient.ts';
import { readMeCache, readPageCache, writeMeCache, writePageCache } from '../api/pageCache.ts';
import { clearAllCache } from '../api/responseCache.ts';
import { BlueskyStatusNotice } from '../components/BlueskyStatusNotice.tsx';
import { NotificationItem } from '../components/NotificationItem.tsx';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import { canStartPageLoadMore } from '../hooks/loadMoreGuard.ts';
import { useBlueskyStatus } from '../hooks/useBlueskyStatus.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { latestBlueskyNotificationAt } from './notificationSeen.ts';

type NotificationsData = Readonly<{
  username: string;
  notifications: readonly Notification[];
  nextMaxId: string | undefined;
}>;

const readCachedNotifications = (): NotificationsData | null => {
  const page = readPageCache<Notification>(notificationsUrl(NOTIFICATION_TYPES));
  const me = readMeCache();
  return page === undefined || me === undefined
    ? null
    : { username: me.username, notifications: page.items, nextMaxId: page.nextMaxId };
};

const NotificationsPage = () => {
  const [cached] = useState(readCachedNotifications);
  const [data, setData] = useState<NotificationsData | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);
  const [error, setError] = useState('');
  const [isFirstPageSettled, setIsFirstPageSettled] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const blueskyStatus = useBlueskyStatus();

  useEffect(() => {
    const fetchFirstPage = async () => {
      try {
        const [page, me] = await Promise.all([
          fetchNotifications(NOTIFICATION_TYPES),
          fetchVerifyCredentials(),
        ]);
        writePageCache(notificationsUrl(NOTIFICATION_TYPES), page);
        writeMeCache(me);
        setData({ username: me.username, notifications: page.items, nextMaxId: page.nextMaxId });
        const newest = page.items[0];
        if (newest !== undefined) {
          saveNotificationsMarker(newest.id).catch((markerError) => {
            console.error('Failed to save the notifications marker:', markerError);
          });
        }
        const seenAt = latestBlueskyNotificationAt(page.items);
        if (seenAt !== undefined) {
          markBlueskyNotificationsSeen(seenAt).catch((seenError) => {
            console.error('Failed to mark the Bluesky notifications as seen:', seenError);
          });
        }
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          clearAllCache();
          window.location.href = '/sign-in';
          return;
        }
        if (cached !== null) return;
        setError(fetchError instanceof TypeError ? 'Network error. Please try again.' : 'Failed to load notifications');
      } finally {
        setIsLoading(false);
        setIsFirstPageSettled(true);
      }
    };
    fetchFirstPage();
  }, []);

  const loadMore = useCallback(async (maxId: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    isLoadingMoreRef.current = true;
    try {
      const page = await fetchNotifications(NOTIFICATION_TYPES, { maxId });
      const nextMaxId = page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId;
      setData((prev) =>
        prev === null
          ? prev
          : { ...prev, notifications: appendUniqueById(prev.notifications, page.items), nextMaxId }
      );
    } catch (loadError) {
      console.error('Failed to load more notifications:', loadError);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [isFirstPageSettled]);

  useInfiniteScroll({ nextCursor: data?.nextMaxId, onLoadMore: loadMore, isFirstPageSettled });

  if (isLoading) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Notifications</h1>
        <div class='flex items-center justify-center py-8'>
          <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
            <circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4' fill='none' />
            <path
              class='opacity-75'
              fill='currentColor'
              d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
            />
          </svg>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Notifications</h1>
        <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Notifications</h1>

      <div class='mb-6 empty:hidden'>
        <BlueskyStatusNotice
          status={blueskyStatus.status}
          page='notifications'
          clientLoadFailed={false}
        />
      </div>

      <a
        href='/settings#notifications'
        class='mb-6 inline-block text-sm text-terracotta hover:text-terracotta-dark dark:text-terracotta-light transition-colors'
      >
        設定
      </a>

      <div class='space-y-6 py-2'>
        {data.notifications.length > 0
          ? (
            data.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                recipientUsername={data.username}
              />
            ))
          )
          : (
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-clay bg-sand-light dark:bg-gray-700 flex items-center justify-center shadow-clay-sm'>
                <svg
                  class='w-8 h-8 text-charcoal-light dark:text-gray-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
                  />
                </svg>
              </div>
              <p class='text-charcoal-light dark:text-gray-400'>
                No notifications yet
              </p>
              <p class='text-sm text-warm-gray-dark dark:text-gray-500 mt-1'>
                When someone likes your posts, you'll see it here.
              </p>
            </div>
          )}
      </div>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<NotificationsPage />, root);
}
