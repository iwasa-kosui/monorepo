import { describe, expect, it } from 'vitest';

import { FeedSourceId } from '../feedSource/feedSourceId.ts';
import { Instant } from '../instant/instant.ts';
import { FEED_ENTRY_KEY_MAX_CHARS, FeedEntry } from './feedEntry.ts';

const now = Instant.orThrow(Date.UTC(2026, 5, 1));

const collect = (overrides: { guid?: string; url?: string }) =>
  FeedEntry.collect({
    feedSourceId: FeedSourceId.generate(),
    guid: 'g',
    url: 'https://e.test/a',
    title: 't',
    description: '',
    publishedAt: null,
    hatenaBookmarkCount: null,
    ...overrides,
  }, now);

describe('FeedEntry.collect', () => {
  it('accepts a guid and a url of exactly the maximum length', () => {
    const long = 'x'.repeat(FEED_ENTRY_KEY_MAX_CHARS);
    expect(collect({ guid: long, url: long }).ok).toBe(true);
  });

  it('rejects a guid longer than the maximum length', () => {
    expect(collect({ guid: 'x'.repeat(FEED_ENTRY_KEY_MAX_CHARS + 1) }).ok).toBe(false);
  });

  it('rejects a url longer than the maximum length', () => {
    expect(collect({ url: 'x'.repeat(FEED_ENTRY_KEY_MAX_CHARS + 1) }).ok).toBe(false);
  });
});
