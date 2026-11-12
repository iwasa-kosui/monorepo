import type { BlueskyPostActions } from '../components/blueskyPostActions.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import {
  type BlueskyReportDialog,
  useBlueskyAuthorModeration,
  type UseBlueskyAuthorModerationOptions,
} from './useBlueskyAuthorModeration.ts';
import { BLUESKY_BOOKMARK_BY_URI_REQUESTS, useBlueskyBookmark } from './useBlueskyBookmark.ts';
import { BLUESKY_LIKE_BY_URI_REQUESTS, useBlueskyLike } from './useBlueskyLike.ts';
import {
  sendBlueskyReplyByUri,
  useBlueskyReplyDialog,
  type UseBlueskyReplyDialogReturn,
} from './useBlueskyReplyDialog.ts';
import { BLUESKY_REPOST_BY_URI_REQUESTS, useBlueskyRepost } from './useBlueskyRepost.ts';

export const useBlueskyUriActions = (
  updateItems: BlueskyItemsUpdater,
  options?: UseBlueskyAuthorModerationOptions,
): Readonly<{
  actions: BlueskyPostActions;
  replyDialog: UseBlueskyReplyDialogReturn;
  reportDialog: BlueskyReportDialog;
  notice: string | undefined;
}> => {
  const { pendingUris: likePendingUris, like, undoLike } = useBlueskyLike(updateItems, BLUESKY_LIKE_BY_URI_REQUESTS);
  const { pendingUris: repostPendingUris, repost, undoRepost } = useBlueskyRepost(
    updateItems,
    BLUESKY_REPOST_BY_URI_REQUESTS,
  );
  const { bookmark, unbookmark } = useBlueskyBookmark(updateItems, BLUESKY_BOOKMARK_BY_URI_REQUESTS);
  const replyDialog = useBlueskyReplyDialog(sendBlueskyReplyByUri);
  const { onMuteThread, onUnmuteThread, onMuteAuthor, onBlockAuthor, onReportPost, reportDialog, notice } =
    useBlueskyAuthorModeration(updateItems, options);
  const actions: BlueskyPostActions = {
    onReply: replyDialog.open,
    onLike: like,
    onUndoLike: undoLike,
    likePendingUris,
    onRepost: repost,
    onUndoRepost: undoRepost,
    repostPendingUris,
    onBookmark: bookmark,
    onUndoBookmark: unbookmark,
    onMuteThread,
    onUnmuteThread,
    onMuteAuthor,
    onBlockAuthor,
    onReportPost,
  };
  return { actions, replyDialog, reportDialog, notice };
};
