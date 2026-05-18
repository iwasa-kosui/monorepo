import { describe, expect, it } from 'vitest';

import { extractThreadTsFromPermalink } from '../src/slack/permalink.ts';

describe('extractThreadTsFromPermalink', () => {
  it('extracts thread_ts from a thread reply permalink', () => {
    const permalink =
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?thread_ts=1644938961.726289&cid=C03387UAMQR';
    expect(extractThreadTsFromPermalink(permalink)).toBe('1644938961.726289');
  });

  it('extracts thread_ts when it is the only query param', () => {
    const permalink = 'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?thread_ts=1644938961.726289';
    expect(extractThreadTsFromPermalink(permalink)).toBe('1644938961.726289');
  });

  it('extracts thread_ts when it appears after another query param', () => {
    const permalink =
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?cid=C03387UAMQR&thread_ts=1644938961.726289';
    expect(extractThreadTsFromPermalink(permalink)).toBe('1644938961.726289');
  });

  it('returns undefined for a top-level message permalink', () => {
    const permalink = 'https://example.slack.com/archives/C03387UAMQR/p1644939337956639';
    expect(extractThreadTsFromPermalink(permalink)).toBeUndefined();
  });

  it('returns undefined when permalink has unrelated query params only', () => {
    const permalink = 'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?cid=C03387UAMQR';
    expect(extractThreadTsFromPermalink(permalink)).toBeUndefined();
  });
});
