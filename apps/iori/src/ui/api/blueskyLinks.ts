import { blueskyProfileUrlOfActor, BSKY_APP_URL } from '../../helper/blueskyUrl.ts';

export const blueskyProfilePageHref = (didOrHandle: string): string =>
  blueskyProfileUrlOfActor(didOrHandle) ?? BSKY_APP_URL;

export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);
