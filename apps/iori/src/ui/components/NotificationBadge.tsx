import type { FC, PropsWithChildren } from 'hono/jsx';

// Hidden until the notificationBadge client script finds unread notifications.
export const WithNotificationBadge: FC<PropsWithChildren> = ({ children }) => (
  <span class='relative inline-flex'>
    {children}
    <span
      data-notification-badge
      hidden
      aria-label='未読の通知'
      class='absolute -top-1.5 -right-2 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-terracotta text-white text-[10px] font-bold leading-[1.125rem] text-center shadow-clay-sm pointer-events-none'
    />
  </span>
);
