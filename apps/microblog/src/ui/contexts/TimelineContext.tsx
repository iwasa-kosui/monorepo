import type { FC, PropsWithChildren } from 'hono/jsx';
import { createContext, useContext, useMemo } from 'hono/jsx';

import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation.ts';
import { usePostActions, type UsePostActionsReturn } from '../hooks/usePostActions.ts';
import { PULL_TO_REFRESH_THRESHOLD, usePullToRefresh, type UsePullToRefreshReturn } from '../hooks/usePullToRefresh.ts';
import { useReplyDialog, type UseReplyDialogReturn } from '../hooks/useReplyDialog.ts';
import { useThreadModal, type UseThreadModalReturn } from '../hooks/useThreadModal.ts';
import { type TimelineData, useTimeline, type UseTimelineReturn } from '../hooks/useTimeline.ts';
import { useUIState, type UseUIStateReturn } from '../hooks/useUIState.ts';

export type TimelineContextValue = Readonly<{
  timeline: UseTimelineReturn;
  data: TimelineData | null;
  actions: UsePostActionsReturn;
  thread: UseThreadModalReturn;
  reply: UseReplyDialogReturn;
  ui: UseUIStateReturn;
  pullToRefresh: UsePullToRefreshReturn;
  pullThreshold: number;
}>;

const TimelineContext = createContext<TimelineContextValue | null>(null);

export const TimelineProvider: FC<PropsWithChildren> = ({ children }) => {
  const timeline = useTimeline();
  const thread = useThreadModal();
  const ui = useUIState();

  const data = timeline.state.status === 'success' ? timeline.state.data : null;

  const reply = useReplyDialog({
    onReplySent: () => {
      timeline.fetchMore(undefined);
    },
  });

  const actions = usePostActions({
    updateTimelineItem: timeline.updateTimelineItem,
    updateThreadPost: thread.updateThreadPost,
    removePost: timeline.removePost,
    refreshTimeline: () => timeline.fetchMore(undefined),
    onPostDeleted: thread.removeFromThread,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await timeline.refresh();
      ui.setSelectedIndex(-1);
    },
    isRefreshing: timeline.isRefreshing,
  });

  const timelineItems = data?.timelineItems ?? [];

  useInfiniteScroll({
    items: timelineItems,
    onLoadMore: timeline.fetchMore,
  });

  useKeyboardNavigation({
    items: timelineItems,
    selectedIndex: ui.selectedIndex,
    setSelectedIndex: ui.setSelectedIndex,
    scrollToSelected: ui.scrollToSelected,
    emojiPickerOpenForIndex: ui.emojiPickerOpenForIndex,
    setEmojiPickerOpenForIndex: ui.setEmojiPickerOpenForIndex,
    replyingToPostId: reply.replyingToPostId,
    threadModalPostId: thread.threadModalPostId,
    likingPostId: actions.actionState.likingPostId,
    undoingLikePostId: actions.actionState.undoingLikePostId,
    onLike: actions.like,
    onUndoLike: actions.undoLike,
    onReply: reply.openReplyDialog,
    onCancelReply: reply.closeReplyDialog,
    onCloseThread: thread.closeThread,
  });

  const value = useMemo(
    (): TimelineContextValue => ({
      timeline,
      data,
      actions,
      thread,
      reply,
      ui,
      pullToRefresh,
      pullThreshold: PULL_TO_REFRESH_THRESHOLD,
    }),
    [timeline, data, actions, thread, reply, ui, pullToRefresh],
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
