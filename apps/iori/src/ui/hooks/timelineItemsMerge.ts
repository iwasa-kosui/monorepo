import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';

export const appendUniqueTimelineItems = (
  existing: readonly TimelineItemWithPost[],
  incoming: readonly TimelineItemWithPost[],
): readonly TimelineItemWithPost[] => {
  const seen = new Set(existing.map((item) => item.timelineItemId));
  const added: TimelineItemWithPost[] = [];
  for (const item of incoming) {
    if (seen.has(item.timelineItemId)) continue;
    seen.add(item.timelineItemId);
    added.push(item);
  }
  return [...existing, ...added];
};
