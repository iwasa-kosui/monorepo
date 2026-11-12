import { blueskyPostUrl, blueskyProfileUrlOfActor, BSKY_APP_URL } from '../../helper/blueskyUrl.ts';

export const blueskyPostPageHref = (uri: string, authorDid: string): string =>
  blueskyPostUrl(authorDid, uri) ?? BSKY_APP_URL;

export const blueskyProfilePageHref = (didOrHandle: string): string =>
  blueskyProfileUrlOfActor(didOrHandle) ?? BSKY_APP_URL;

export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);
