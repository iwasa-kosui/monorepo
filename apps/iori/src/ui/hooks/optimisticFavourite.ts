import type { Status } from '../../adaptor/mastodon/entities.ts';
import { displayStatus, withFavourited, withUpdatedStatus } from '../api/status.ts';

type StatusUpdater = (
  postId: string,
  updater: (status: Status) => Status,
) => void;

const withFavouritesCountDelta = (status: Status, delta: number): Status => ({
  ...status,
  favourites_count: Math.max(0, status.favourites_count + delta),
});

export const withOptimisticFavourite = (status: Status, favourited: boolean): Status => {
  const delta = favourited ? 1 : -1;
  const flagged = withFavourited(status, favourited);
  return flagged.reblog === null
    ? withFavouritesCountDelta(flagged, delta)
    : { ...flagged, reblog: withFavouritesCountDelta(flagged.reblog, delta) };
};

export const withRestoredFavourite = (current: Status, before: Status): Status => {
  const { favourited, favourites_count } = displayStatus(before);
  if (current.reblog === null) {
    return { ...current, favourited, favourites_count };
  }
  return { ...current, favourited, reblog: { ...current.reblog, favourited, favourites_count } };
};

export const runExclusive = async (
  inFlight: Set<string>,
  postId: string,
  task: () => Promise<void>,
): Promise<void> => {
  if (inFlight.has(postId)) return;
  inFlight.add(postId);
  try {
    await task();
  } finally {
    inFlight.delete(postId);
  }
};

export const runOptimisticFavourite = async ({
  postId,
  favourited,
  request,
  updateTimelineItem,
  updateThreadPost,
}: Readonly<{
  postId: string;
  favourited: boolean;
  request: (postId: string) => Promise<Status>;
  updateTimelineItem: StatusUpdater;
  updateThreadPost?: StatusUpdater;
}>): Promise<void> => {
  let beforeTimeline: Status | undefined;
  let beforeThread: Status | undefined;
  updateTimelineItem(postId, (status) => {
    beforeTimeline ??= status;
    return withOptimisticFavourite(status, favourited);
  });
  updateThreadPost?.(postId, (status) => {
    beforeThread ??= status;
    return withOptimisticFavourite(status, favourited);
  });
  let updated: Status;
  try {
    updated = await request(postId);
  } catch (error) {
    const timelineBefore = beforeTimeline;
    if (timelineBefore !== undefined) {
      updateTimelineItem(postId, (status) => withRestoredFavourite(status, timelineBefore));
    }
    const threadBefore = beforeThread;
    if (threadBefore !== undefined) {
      updateThreadPost?.(postId, (status) => withRestoredFavourite(status, threadBefore));
    }
    throw error;
  }
  updateTimelineItem(postId, (status) => withUpdatedStatus(status, updated));
  updateThreadPost?.(postId, (status) => withUpdatedStatus(status, updated));
};
