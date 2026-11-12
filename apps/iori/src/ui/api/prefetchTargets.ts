import {
  ARTICLES_URL,
  blueskyHomeTimelineUrl,
  bookmarksUrl,
  favouritesUrl,
  homeTimelineUrl,
  NOTIFICATION_TYPES,
  notificationsUrl,
  verifyCredentialsUrl,
} from './mastodonClient.ts';

export const prefetchUrlsFor = (pathname: string): readonly string[] => {
  switch (pathname) {
    case '/':
      return [homeTimelineUrl(), verifyCredentialsUrl(), blueskyHomeTimelineUrl()];
    case '/likes':
      return [favouritesUrl()];
    case '/bookmarks':
      return [bookmarksUrl()];
    case '/notifications':
      return [notificationsUrl(NOTIFICATION_TYPES), verifyCredentialsUrl()];
    case '/articles':
      return [ARTICLES_URL];
    default:
      return [];
  }
};
