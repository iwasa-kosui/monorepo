import type { BlueskyPostActions } from '../components/blueskyPostActions.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { BLUESKY_LIKE_BY_URI_REQUESTS, useBlueskyLike } from './useBlueskyLike.ts';
import {
  sendBlueskyReplyByUri,
  useBlueskyReplyDialog,
  type UseBlueskyReplyDialogReturn,
} from './useBlueskyReplyDialog.ts';
import { BLUESKY_REPOST_BY_URI_REQUESTS, useBlueskyRepost } from './useBlueskyRepost.ts';

export const useBlueskyUriActions = (
  updateItems: BlueskyItemsUpdater,
): Readonly<{ actions: BlueskyPostActions; replyDialog: UseBlueskyReplyDialogReturn }> => {
  const { pendingUris: likePendingUris, like, undoLike } = useBlueskyLike(updateItems, BLUESKY_LIKE_BY_URI_REQUESTS);
  const { pendingUris: repostPendingUris, repost, undoRepost } = useBlueskyRepost(
    updateItems,
    BLUESKY_REPOST_BY_URI_REQUESTS,
  );
  const replyDialog = useBlueskyReplyDialog(sendBlueskyReplyByUri);
  const actions: BlueskyPostActions = {
    onReply: replyDialog.open,
    onLike: like,
    onUndoLike: undoLike,
    likePendingUris,
    onRepost: repost,
    onUndoRepost: undoRepost,
    repostPendingUris,
  };
  return { actions, replyDialog };
};
