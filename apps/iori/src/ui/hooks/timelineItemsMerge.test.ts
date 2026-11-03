import { describe, expect, it } from 'vitest';

import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import { appendUniqueTimelineItems } from './timelineItemsMerge.ts';

const item = (timelineItemId: string): TimelineItemWithPost => ({ timelineItemId }) as unknown as TimelineItemWithPost;

const ids = (items: readonly TimelineItemWithPost[]) => items.map((i) => i.timelineItemId);

describe('appendUniqueTimelineItems', () => {
  it('appends new items after the existing ones', () => {
    const merged = appendUniqueTimelineItems([item('a'), item('b')], [item('c'), item('d')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops incoming items whose id already exists and keeps the order', () => {
    const merged = appendUniqueTimelineItems([item('a'), item('b')], [item('b'), item('c')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a single item when the same id appears twice in the incoming items', () => {
    const merged = appendUniqueTimelineItems([item('a')], [item('b'), item('b')]);

    expect(ids(merged)).toEqual(['a', 'b']);
  });

  it('returns the existing items when every incoming item is a duplicate', () => {
    const merged = appendUniqueTimelineItems([item('a'), item('b')], [item('a'), item('b')]);

    expect(ids(merged)).toEqual(['a', 'b']);
  });
});
