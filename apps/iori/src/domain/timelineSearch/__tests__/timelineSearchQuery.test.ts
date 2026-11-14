import { describe, expect, it } from 'vitest';

import { TimelineSearchQuery } from '../timelineSearchQuery.ts';

describe('TimelineSearchQuery', () => {
  it('前後の空白を除き、limit の既定は 20', () => {
    const query = TimelineSearchQuery.of({ text: '  旅行 写真  ' });
    expect(query.ok).toBe(true);
    if (query.ok) expect(query.val).toEqual({ text: '旅行 写真', limit: 20 });
  });

  it('text は 1 文字から 200 文字まで', () => {
    expect(TimelineSearchQuery.of({ text: 'a' }).ok).toBe(true);
    expect(TimelineSearchQuery.of({ text: 'あ'.repeat(200) }).ok).toBe(true);
    expect(TimelineSearchQuery.of({ text: 'あ'.repeat(201) }).ok).toBe(false);
    expect(TimelineSearchQuery.of({ text: '' }).ok).toBe(false);
    expect(TimelineSearchQuery.of({ text: '   ' }).ok).toBe(false);
  });

  it('200 文字は UTF-16 ではなく文字数で数える', () => {
    expect(TimelineSearchQuery.of({ text: '😀'.repeat(200) }).ok).toBe(true);
    expect(TimelineSearchQuery.of({ text: '😀'.repeat(201) }).ok).toBe(false);
  });
});
