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

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

async function checkSubscription() {
  const button = document.getElementById('push-subscribe-btn');
  const status = document.getElementById('push-status');
  const iosGuide = document.getElementById('ios-install-guide');

  const ios = isIOS();
  const standalone = isInStandaloneMode();

  // iOS Safari (not PWA) - show install guide
  if (ios && !standalone) {
    if (button) button.style.display = 'none';
    if (status) status.style.display = 'none';
    if (iosGuide) iosGuide.style.display = 'block';
    return;
  }

  // Check Web Push support
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (button) button.style.display = 'none';
    if (status) {
      status.textContent = 'Push notifications not supported on this browser';
      status.className = 'text-sm text-gray-500 dark:text-gray-400';
    }
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      if (button) button.style.display = 'none';
      if (status) {
        status.innerHTML = '<svg class="inline w-4 h-4 mr-1 align-text-bottom" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Push notifications enabled';
        status.className = 'text-sm text-gray-500 dark:text-gray-400';
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
      status.innerHTML = '<svg class="inline w-4 h-4 mr-1 align-text-bottom" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Push notifications enabled';
      status.className = 'text-sm text-gray-500 dark:text-gray-400';
    }
  } catch (error) {
    console.error('Failed to subscribe:', error);
    if (button) {
      button.disabled = false;
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
  <Layout isLoggedIn={true}>
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>
        Notifications
      </h1>

      <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-6'>
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
            class='flex items-center justify-center p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
            title='プッシュ通知を有効にする'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              class='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              stroke-width='2'
            >
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
              />
            </svg>
          </button>
        </div>

        <div id='ios-install-guide' class='hidden mt-4 pt-4'>
          <div class='flex items-start gap-3'>
            <div class='flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center'>
              <svg
                class='w-5 h-5 text-blue-600 dark:text-blue-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z'
                />
              </svg>
            </div>
            <div class='flex-1'>
              <h3 class='text-sm font-medium text-gray-900 dark:text-white mb-2'>
                Install this app to enable notifications
              </h3>
              <p class='text-sm text-gray-600 dark:text-gray-400 mb-3'>
                iOS requires this app to be installed on your home screen to receive push notifications.
              </p>
              <ol class='text-sm text-gray-600 dark:text-gray-400 space-y-2'>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                    1
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button{' '}
                    <svg class='inline w-4 h-4 align-text-bottom' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path
                        stroke-linecap='round'
                        stroke-linejoin='round'
                        stroke-width='2'
                        d='M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z'
                      />
                    </svg>{' '}
                    at the bottom of Safari
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>"Add to Home Screen"</strong>
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                    3
                  </span>
                  <span>
                    Tap <strong>"Add"</strong> in the top right
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium'>
                    4
                  </span>
                  <span>Open the app from your home screen and return here</span>
                </li>
              </ol>
              <p class='text-xs text-gray-500 dark:text-gray-500 mt-3'>
                Requires iOS 16.4 or later
              </p>
            </div>
          </div>
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
            <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
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
