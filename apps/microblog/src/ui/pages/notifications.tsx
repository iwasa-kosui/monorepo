import type { NotificationWithDetails } from '../../domain/notification/notification.ts';
import type { User } from '../../domain/user/user.ts';
import { Layout } from '../../layout.tsx';
import { NotificationItem } from '../components/NotificationItem.tsx';

type Props = Readonly<{
  user: User;
  notifications: ReadonlyArray<{
    notification: NotificationWithDetails;
    sanitizedContent: string;
  }>;
}>;

export const NotificationsPage = ({ user: _user, notifications }: Props) => (
  <Layout>
    <section class='mb-8'>
      <div class='flex items-center justify-between mb-6'>
        <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
          Notifications
        </h1>
        <a
          href='/'
          class='text-sm text-blue-600 dark:text-blue-400 hover:underline'
        >
          Back to Home
        </a>
      </div>

      <div class='space-y-4'>
        {notifications.length > 0
          ? (
            notifications.map(({ notification, sanitizedContent }) => (
              <NotificationItem
                key={notification.notification.notificationId}
                notification={notification}
                sanitizedContent={sanitizedContent}
              />
            ))
          )
          : (
            <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
                <svg
                  class='w-8 h-8 text-gray-400 dark:text-gray-500'
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
              <p class='text-gray-500 dark:text-gray-400'>
                No notifications yet
              </p>
              <p class='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                When someone likes your posts, you'll see it here.
              </p>
            </div>
          )}
      </div>
    </section>
  </Layout>
);
