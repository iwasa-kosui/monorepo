import type { FC, PropsWithChildren } from 'hono/jsx';
import { createContext, useContext, useMemo, useState } from 'hono/jsx';

import { homeFeedCursor, type HomeItem, mergeHomeFeed } from '../hooks/homeFeed.ts';
import { readHomeSnapshot } from '../hooks/homeSnapshot.ts';
import { useBlueskyLike, type UseBlueskyLikeReturn } from '../hooks/useBlueskyLike.ts';
import { useBlueskyReplyDialog, type UseBlueskyReplyDialogReturn } from '../hooks/useBlueskyReplyDialog.ts';
import { useBlueskyRepost, type UseBlueskyRepostReturn } from '../hooks/useBlueskyRepost.ts';
import { useBlueskyStatus, type UseBlueskyStatusReturn } from '../hooks/useBlueskyStatus.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation.ts';
import { usePostActions, type UsePostActionsReturn } from '../hooks/usePostActions.ts';
import { PULL_TO_REFRESH_THRESHOLD, usePullToRefresh, type UsePullToRefreshReturn } from '../hooks/usePullToRefresh.ts';
import { useReadingPosition, type UseReadingPositionReturn } from '../hooks/useReadingPosition.ts';
import { useReplyDialog, type UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { useThreadModal, type UseThreadModalReturn } from '../hooks/useThreadModal.ts';
import { type TimelineData, useTimeline, type UseTimelineReturn } from '../hooks/useTimeline.ts';
import { useUIState, type UseUIStateReturn } from '../hooks/useUIState.ts';

export type TimelineContextValue = Readonly<{
  timeline: UseTimelineReturn;
  data: TimelineData | null;
  items: readonly HomeItem[];
  actions: UsePostActionsReturn;
  blueskyLike: UseBlueskyLikeReturn;
  blueskyRepost: UseBlueskyRepostReturn;
  blueskyReply: UseBlueskyReplyDialogReturn;
  blueskyStatus: UseBlueskyStatusReturn;
  thread: UseThreadModalReturn;
  reply: UseReplyDialogReturn;
  ui: UseUIStateReturn;
  pullToRefresh: UsePullToRefreshReturn;
  pullThreshold: number;
  reading: UseReadingPositionReturn;
}>;

const TimelineContext = createContext<TimelineContextValue | null>(null);

export const TimelineProvider: FC<PropsWithChildren> = ({ children }) => {
  const [snapshot] = useState(() => readHomeSnapshot());
  const timeline = useTimeline(snapshot);
  const thread = useThreadModal();
  const ui = useUIState();
  const blueskyStatus = useBlueskyStatus();

  const data = timeline.state.status === 'success' ? timeline.state.data : null;

  const reply = useReplyDialog({
    onReplySent: () => {
      timeline.reload();
    },
  });

  const actions = usePostActions({
    updateTimelineItem: timeline.updateTimelineItem,
    updateThreadPost: thread.updateThreadPost,
    removePost: timeline.removePost,
    removeAccountPosts: timeline.removeAccountPosts,
    refreshTimeline: async () => {
      await timeline.reload();
    },
    onPostDeleted: thread.removeFromThread,
  });

  const blueskyLike = useBlueskyLike(timeline.updateBlueskyItems);
  const blueskyRepost = useBlueskyRepost(timeline.updateBlueskyItems);
  const blueskyReply = useBlueskyReplyDialog();

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      const [count] = await Promise.all([timeline.refresh(), blueskyStatus.reload()]);
      ui.setSelectedIndex(-1);
      return count;
    },
  });

  const items = useMemo(
    (): readonly HomeItem[] =>
      data === null
        ? []
        : mergeHomeFeed({
          statuses: data.statuses,
          hasMoreStatuses: data.nextMaxId !== undefined,
          bluesky: data.bluesky.items,
          hasMoreBluesky: data.bluesky.cursor !== undefined,
        }),
    [data],
  );

  const reading = useReadingPosition({ items, data, initialAnchor: snapshot?.anchor });

  useInfiniteScroll({
    nextCursor: data === null ? undefined : homeFeedCursor(data.nextMaxId, data.bluesky.cursor),
    onLoadMore: timeline.loadMore,
    isFirstPageSettled: timeline.isFirstPageSettled,
  });

  useKeyboardNavigation({
    items,
    selectedIndex: ui.selectedIndex,
    setSelectedIndex: ui.setSelectedIndex,
    scrollToSelected: ui.scrollToSelected,
    emojiPickerOpenForIndex: ui.emojiPickerOpenForIndex,
    setEmojiPickerOpenForIndex: ui.setEmojiPickerOpenForIndex,
    replyingToPostId: reply.replyingToPostId ?? blueskyReply.target?.feedItemId ?? null,
    threadModalPostId: thread.threadModalPostId,
    onLike: actions.like,
    onUndoLike: actions.undoLike,
    onReply: reply.openReplyDialog,
    onBlueskyReply: blueskyReply.open,
    onCancelReply: () => {
      reply.closeReplyDialog();
      blueskyReply.close();
    },
    onCloseThread: thread.closeThread,
  });

  const value = useMemo(
    (): TimelineContextValue => ({
      timeline,
      data,
      items,
      actions,
      blueskyLike,
      blueskyRepost,
      blueskyReply,
      blueskyStatus,
      thread,
      reply,
      ui,
      pullToRefresh,
      pullThreshold: PULL_TO_REFRESH_THRESHOLD,
      reading,
    }),
    [
      timeline,
      data,
      items,
      actions,
      blueskyLike,
      blueskyRepost,
      blueskyReply,
      blueskyStatus,
      thread,
      reply,
      ui,
      pullToRefresh,
      reading,
    ],
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
};

export const useTimelineContext = (): TimelineContextValue => {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error('useTimelineContext must be used within TimelineProvider');
  }
  return ctx;
};
