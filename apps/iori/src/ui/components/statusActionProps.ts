import type { Status } from '../../adaptor/mastodon/entities.ts';
import { displayStatus } from '../api/status.ts';
import type { ActionState, UsePostActionsReturn } from '../hooks/usePostActions.ts';

export type StatusActions = Readonly<
  & Pick<
    UsePostActionsReturn,
    'like' | 'undoLike' | 'bookmarkPost' | 'undoBookmarkPost' | 'repost' | 'undoRepost' | 'vote'
  >
  & {
    actionState: Pick<ActionState, 'likingPostId' | 'undoingLikePostId' | 'repostingPostId' | 'undoingRepostPostId'>;
  }
>;

export const statusActionProps = (actions: StatusActions | undefined, status: Status) => {
  if (actions === undefined) return {};
  const postId = displayStatus(status).id;
  return {
    onLike: actions.like,
    isLiking: actions.actionState.likingPostId === postId,
    onUndoLike: actions.undoLike,
    isUndoingLike: actions.actionState.undoingLikePostId === postId,
    onBookmark: actions.bookmarkPost,
    onUndoBookmark: actions.undoBookmarkPost,
    onRepost: actions.repost,
    isReposting: actions.actionState.repostingPostId === postId,
    onUndoRepost: actions.undoRepost,
    isUndoingRepost: actions.actionState.undoingRepostPostId === postId,
    onVote: actions.vote,
  };
};

export const likeRepostActionProps = (actions: StatusActions | undefined, status: Status) => {
  if (actions === undefined) return {};
  const postId = displayStatus(status).id;
  return {
    onLike: actions.like,
    isLiking: actions.actionState.likingPostId === postId,
    onUndoLike: actions.undoLike,
    isUndoingLike: actions.actionState.undoingLikePostId === postId,
    onRepost: actions.repost,
    isReposting: actions.actionState.repostingPostId === postId,
    onUndoRepost: actions.undoRepost,
    isUndoingRepost: actions.actionState.undoingRepostPostId === postId,
  };
};
