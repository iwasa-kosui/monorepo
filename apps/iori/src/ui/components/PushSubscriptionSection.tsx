import { useEffect, useState } from 'hono/jsx';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isInStandaloneMode = () => {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
};

export const PushSubscriptionSection = () => {
  const [pushStatus, setPushStatus] = useState<
    'checking' | 'subscribed' | 'available' | 'unsupported' | 'ios-guide' | 'error'
  >('checking');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    const check = async () => {
      const ios = isIOS();
      const standalone = isInStandaloneMode();

      if (ios && !standalone) {
        setPushStatus('ios-guide');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushStatus(subscription ? 'subscribed' : 'available');
      } catch {
        setPushStatus('available');
      }
    };
    check();
  }, []);

  const handleSubscribe = async () => {
    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const response = await fetch('/api/v1/push/vapid-public-key');
      const { publicKey } = await response.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch('/api/iori/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      setPushStatus('subscribed');
    } catch {
      setPushStatus('error');
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-5 mb-6 clay-hover-lift hover:shadow-clay-hover dark:hover:shadow-clay-dark-hover'>
      <div class='flex items-center justify-between'>
        <div>
          <h2 class='text-sm font-medium text-charcoal dark:text-white'>
            Push Notifications
          </h2>
          <p class='text-sm text-charcoal-light dark:text-gray-400'>
            {pushStatus === 'subscribed'
              ? (
                <span>
                  <svg
                    class='inline w-4 h-4 mr-1 align-text-bottom'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 13l4 4L19 7' />
                  </svg>
                  Push notifications enabled
                </span>
              )
              : pushStatus === 'unsupported'
              ? 'Push notifications not supported on this browser'
              : pushStatus === 'error'
              ? 'Failed to enable push notifications'
              : 'Get notified when someone likes your posts'}
          </p>
        </div>
        {pushStatus === 'available' && (
          <button
            type='button'
            onClick={handleSubscribe}
            disabled={isSubscribing}
            class='flex items-center justify-center p-2 rounded-xl text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light hover:bg-sand-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50'
            title='Enable push notifications'
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
        )}
      </div>

      {pushStatus === 'ios-guide' && (
        <div class='mt-4 pt-4'>
          <div class='flex items-start gap-3'>
            <div class='flex-shrink-0 w-10 h-10 rounded-full bg-sand-light dark:bg-gray-700 flex items-center justify-center shadow-clay-sm'>
              <svg
                class='w-5 h-5 text-terracotta dark:text-terracotta-light'
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
              <h3 class='text-sm font-medium text-charcoal dark:text-white mb-2'>
                Install this app to enable notifications
              </h3>
              <p class='text-sm text-charcoal-light dark:text-gray-400 mb-3'>
                iOS requires this app to be installed on your home screen to receive push notifications.
              </p>
              <ol class='text-sm text-charcoal-light dark:text-gray-400 space-y-2'>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-warm-gray dark:bg-gray-700 flex items-center justify-center text-xs font-medium shadow-clay-sm'>
                    1
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button at the bottom of Safari
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-warm-gray dark:bg-gray-700 flex items-center justify-center text-xs font-medium shadow-clay-sm'>
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>"Add to Home Screen"</strong>
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-warm-gray dark:bg-gray-700 flex items-center justify-center text-xs font-medium shadow-clay-sm'>
                    3
                  </span>
                  <span>
                    Tap <strong>"Add"</strong> in the top right
                  </span>
                </li>
                <li class='flex items-start gap-2'>
                  <span class='flex-shrink-0 w-5 h-5 rounded-full bg-warm-gray dark:bg-gray-700 flex items-center justify-center text-xs font-medium shadow-clay-sm'>
                    4
                  </span>
                  <span>Open the app from your home screen and return here</span>
                </li>
              </ol>
              <p class='text-xs text-charcoal-light dark:text-gray-500 mt-3'>
                Requires iOS 16.4 or later
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
