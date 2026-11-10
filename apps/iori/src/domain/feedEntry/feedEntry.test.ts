import { describe, expect, it } from 'vitest';

import { FeedSourceId } from '../feedSource/feedSourceId.ts';
import { Instant } from '../instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../interestSource/embedding.ts';
import { FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS, FEED_ENTRY_KEY_MAX_CHARS, FeedEntry } from './feedEntry.ts';

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

describe('FeedEntry.toEmbeddingText', () => {
  it('joins the title and the description with a newline', () => {
    expect(FeedEntry.toEmbeddingText({ title: 'タイトル', description: '説明' })).toBe('タイトル\n説明');
  });

  it('truncates by code points so that surrogate pairs stay whole', () => {
    const text = FeedEntry.toEmbeddingText({
      title: '😀'.repeat(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS),
      description: 'x',
    });

    expect(Array.from(text)).toHaveLength(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS);
    expect(text).toBe('😀'.repeat(FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS));
  });
});

describe('FeedEntry.embed', () => {
  const entry = () => {
    const collected = collect({});
    if (!collected.ok) throw new Error('unexpected');
    return collected.val.aggregateState;
  };

  it('creates an embedded event that carries the vector and the time', () => {
    const embedded = FeedEntry.embed(entry(), new Float32Array(EMBEDDING_DIMENSIONS), now);

    expect(embedded.ok && embedded.val.eventName).toBe('feedEntry.embedded');
    expect(embedded.ok && embedded.val.eventPayload).toMatchObject({ embeddedAt: now });
  });

  it('rejects a vector whose dimensions are not 1024', () => {
    const embedded = FeedEntry.embed(entry(), new Float32Array(3), now);

    expect(embedded).toMatchObject({ ok: false, err: { type: 'EmbeddingDimensionsError' } });
  });
});
