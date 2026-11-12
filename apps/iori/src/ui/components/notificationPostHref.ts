import { ioriBlueskyPostPath } from '../../helper/blueskyUrl.ts';

export const blueskyNotificationPostHref = (
  bluesky: Readonly<{ uri?: string | undefined; url: string }> | undefined,
): string | undefined => {
  if (bluesky === undefined) return undefined;
  const inApp = bluesky.uri === undefined ? undefined : ioriBlueskyPostPath(bluesky.uri);
  return inApp ?? bluesky.url;
};
