import type { FC } from 'hono/jsx';

type Props = {
  isLoggedIn?: boolean;
};

export const BottomNav: FC<Props> = ({ isLoggedIn = false }) => (
  <nav class='md:hidden fixed bottom-0 left-0 right-0 bg-cream/80 dark:bg-gray-900/80 backdrop-blur-lg border-t border-warm-gray-dark dark:border-gray-700 safe-area-inset-bottom shadow-clay dark:shadow-clay-dark'>
    <div class='flex justify-around items-center h-14'>
      <a
        href='/'
        class='flex flex-col items-center justify-center flex-1 h-full text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
      >
        <svg class='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
          />
        </svg>
      </a>
      <a
        href={isLoggedIn ? '#post-modal' : '/sign-in'}
        class='flex flex-col items-center justify-center flex-1 h-full text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
      >
        <svg class='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
        </svg>
      </a>
      <a
        href='/notifications'
        class='flex flex-col items-center justify-center flex-1 h-full text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
      >
        <svg class='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
          />
        </svg>
      </a>
      {isLoggedIn && (
        <a
          href='/articles'
          class='flex flex-col items-center justify-center flex-1 h-full text-charcoal-light dark:text-gray-400 hover:text-terracotta dark:hover:text-terracotta-light transition-colors'
        >
          <svg class='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
            />
          </svg>
        </a>
      )}
    </div>
  </nav>
);
