import { describe, expect, it } from 'vitest';

import { blueskyNotificationPostHref } from './notificationPostHref.ts';

const URL = 'https://bsky.app/profile/did:plc:me/post/3kpost';

describe('blueskyNotificationPostHref', () => {
  it('returns the post page in iori when the uri is a post uri', () => {
    expect(blueskyNotificationPostHref({ uri: 'at://did:plc:me/app.bsky.feed.post/3kpost', url: URL }))
      .toBe('/bluesky/profile/did:plc:me/post/3kpost');
  });

  it('falls back to the bsky.app url when the uri is missing', () => {
    expect(blueskyNotificationPostHref({ url: URL })).toBe(URL);
  });

  it('falls back to the bsky.app url when the uri is not a post uri', () => {
    expect(blueskyNotificationPostHref({ uri: 'at://did:plc:me/app.bsky.feed.like/3klike', url: URL })).toBe(URL);
  });

  it('returns undefined for a notification without Bluesky data', () => {
    expect(blueskyNotificationPostHref(undefined)).toBeUndefined();
  });
});
