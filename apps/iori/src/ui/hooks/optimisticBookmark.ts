import type { Status } from '../../adaptor/mastodon/entities.ts';
import { displayStatus, withBookmarked, withUpdatedStatus } from '../api/status.ts';

type StatusUpdater = (
  postId: string,
  updater: (status: Status) => Status,
) => void;

export const withRestoredBookmark = (current: Status, before: Status): Status => {
  const { bookmarked } = displayStatus(before);
  return withBookmarked(current, bookmarked);
};

export const runOptimisticBookmark = async ({
  postId,
  bookmarked,
  request,
  updateTimelineItem,
  updateThreadPost,
}: Readonly<{
  postId: string;
  bookmarked: boolean;
  request: (postId: string) => Promise<Status>;
  updateTimelineItem: StatusUpdater;
  updateThreadPost?: StatusUpdater;
}>): Promise<void> => {
  let beforeTimeline: Status | undefined;
  let beforeThread: Status | undefined;
  updateTimelineItem(postId, (status) => {
    beforeTimeline ??= status;
    return withBookmarked(status, bookmarked);
  });
  updateThreadPost?.(postId, (status) => {
    beforeThread ??= status;
    return withBookmarked(status, bookmarked);
  });
  let updated: Status;
  try {
    updated = await request(postId);
  } catch (error) {
    const timelineBefore = beforeTimeline;
    if (timelineBefore !== undefined) {
      updateTimelineItem(postId, (status) => withRestoredBookmark(status, timelineBefore));
    }
    const threadBefore = beforeThread;
    if (threadBefore !== undefined) {
      updateThreadPost?.(postId, (status) => withRestoredBookmark(status, threadBefore));
    }
    throw error;
  }
  updateTimelineItem(postId, (status) => withUpdatedStatus(status, updated));
  updateThreadPost?.(postId, (status) => withUpdatedStatus(status, updated));
};
