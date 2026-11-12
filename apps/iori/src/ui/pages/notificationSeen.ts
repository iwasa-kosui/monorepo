import type { Notification } from '../../adaptor/mastodon/entities.ts';

export const latestBlueskyNotificationAt = (notifications: readonly Notification[]): string | undefined => {
  let latest: number | undefined;
  for (const notification of notifications) {
    if (notification.iori?.bluesky === undefined) continue;
    const time = Date.parse(notification.created_at);
    if (!Number.isNaN(time) && (latest === undefined || time > latest)) latest = time;
  }
  return latest === undefined ? undefined : new Date(latest).toISOString();
};
