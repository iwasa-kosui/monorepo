import { raw } from 'hono/html';

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

const pushSubscriptionScript = `
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function checkSubscription() {
  const button = document.getElementById('push-subscribe-btn');
  const status = document.getElementById('push-status');

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (button) button.style.display = 'none';
    if (status) status.textContent = 'Push notifications not supported';
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      if (button) button.style.display = 'none';
      if (status) {
        status.textContent = 'Push notifications enabled';
        status.className = 'text-sm text-green-600 dark:text-green-400';
      }
    }
  } catch (error) {
    console.error('Error checking subscription:', error);
  }
}

async function subscribeToPush() {
  const button = document.getElementById('push-subscribe-btn');
  const status = document.getElementById('push-status');

  if (button) {
    button.disabled = true;
    button.textContent = 'Enabling...';
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const response = await fetch('/api/v1/push/vapid-public-key');
    const { publicKey } = await response.json();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (button) button.style.display = 'none';
    if (status) {
      status.textContent = 'Push notifications enabled';
      status.className = 'text-sm text-green-600 dark:text-green-400';
    }
  } catch (error) {
    console.error('Failed to subscribe:', error);
    if (button) {
      button.disabled = false;
      button.textContent = 'Enable Push Notifications';
    }
    if (status) {
      status.textContent = 'Failed to enable push notifications';
      status.className = 'text-sm text-red-600 dark:text-red-400';
    }
  }
}

function init() {
  checkSubscription();
  const button = document.getElementById('push-subscribe-btn');
  if (button) {
    button.addEventListener('click', subscribeToPush);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
`;

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

      <div class='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6'>
        <div class='flex items-center justify-between'>
          <div>
            <h2 class='text-sm font-medium text-gray-900 dark:text-white'>
              Push Notifications
            </h2>
            <p id='push-status' class='text-sm text-gray-500 dark:text-gray-400'>
              Get notified when someone likes your posts
            </p>
          </div>
          <button
            id='push-subscribe-btn'
            type='button'
            class='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50'
          >
            Enable Push Notifications
          </button>
        </div>
      </div>

      {raw(`<script>${pushSubscriptionScript}</script>`)}

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
