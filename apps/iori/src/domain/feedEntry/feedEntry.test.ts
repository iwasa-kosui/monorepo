import { describe, expect, it } from 'vitest';

import { FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS, FeedEntry } from './feedEntry.ts';

describe('FeedEntry.toEmbeddingText', () => {
  it('truncates by code points so that surrogate pairs stay whole', () => {
    const text = FeedEntry.toEmbeddingText({
      title: '😀'.repeat(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS),
      description: 'x',
    });

    expect(Array.from(text)).toHaveLength(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS);
    expect(text).toBe('😀'.repeat(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS));
  });
});
