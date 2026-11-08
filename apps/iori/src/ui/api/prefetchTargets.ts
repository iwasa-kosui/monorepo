import {
  ARTICLES_URL,
  favouritesUrl,
  homeTimelineUrl,
  NOTIFICATION_TYPES,
  notificationsUrl,
  verifyCredentialsUrl,
} from './mastodonClient.ts';

export const prefetchUrlsFor = (pathname: string): readonly string[] => {
  switch (pathname) {
    case '/':
      return [homeTimelineUrl(), verifyCredentialsUrl()];
    case '/likes':
      return [favouritesUrl()];
    case '/notifications':
      return [notificationsUrl(NOTIFICATION_TYPES), verifyCredentialsUrl()];
    case '/articles':
      return [ARTICLES_URL];
    default:
      return [];
  }
};
