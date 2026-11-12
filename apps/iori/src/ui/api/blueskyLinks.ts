import { blueskyProfilePathOf, blueskyProfileUrlOfActor, BSKY_APP_URL } from '../../helper/blueskyUrl.ts';

export const blueskyProfilePageHref = (didOrHandle: string): string =>
  blueskyProfileUrlOfActor(didOrHandle) ?? BSKY_APP_URL;

export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);

export const blueskyFeedPagePath = (uri: string): string => `/feeds?uri=${encodeURIComponent(uri)}`;

export const blueskyActorPagePath = (actor: Readonly<{ did: string; handle: string }>): string =>
  blueskyProfilePathOf(actor.handle === 'handle.invalid' ? actor.did : actor.handle);
