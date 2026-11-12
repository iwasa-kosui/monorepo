import { type StatusUpdater, usePostActions, type UsePostActionsReturn } from './usePostActions.ts';

const ignore = () => {};
const resolved = async () => {};

export const useStatusListActions = (updateStatus: StatusUpdater): UsePostActionsReturn =>
  usePostActions({
    updateTimelineItem: updateStatus,
    updateRepostedItem: updateStatus,
    removePost: ignore,
    removeAccountPosts: ignore,
    refreshTimeline: resolved,
  });
