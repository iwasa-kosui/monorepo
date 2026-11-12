import type { FC } from 'hono/jsx';

import { WithMessageBadge } from './MessageBadge.tsx';
import { WithNotificationBadge } from './NotificationBadge.tsx';

type Props = {
  isLoggedIn?: boolean;
};

export const Sidebar: FC<Props> = ({ isLoggedIn = false }) => (
  <aside class='hidden md:flex fixed left-0 top-0 h-full flex-col p-4'>
    <nav class='flex-1 items-center content-center space-y-2'>
      <a
        href='/'
        class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
      >
        <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
          />
        </svg>
      </a>
      <a
        href={isLoggedIn ? '/#post-modal' : '/sign-in'}
        class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
      >
        <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
        </svg>
      </a>
      <a
        href='/notifications'
        class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
      >
        <WithNotificationBadge>
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
            />
          </svg>
        </WithNotificationBadge>
      </a>
      {isLoggedIn && (
        <a
          href='/messages'
          aria-label='メッセージ'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <WithMessageBadge>
            <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
              />
            </svg>
          </WithMessageBadge>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/likes'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
            />
          </svg>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/bookmarks'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
            />
          </svg>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/digest'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z'
            />
          </svg>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/x'
          aria-label='X'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z'
            />
          </svg>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/articles'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
            />
          </svg>
        </a>
      )}
      {isLoggedIn && (
        <a
          href='/search'
          aria-label='検索'
          class='flex items-center gap-3 px-4 py-3 rounded-clay text-charcoal-light dark:text-gray-300 hover:bg-cream dark:hover:bg-gray-800 hover:shadow-clay-sm dark:hover:shadow-clay-dark transition-all clay-hover-lift'
        >
          <svg class='w-7 h-7' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
            />
          </svg>
        </a>
      )}
    </nav>
  </aside>
);
