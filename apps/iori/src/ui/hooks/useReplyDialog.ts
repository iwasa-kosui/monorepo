import { useCallback, useState } from 'hono/jsx';

import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import { createStatus, failureMessage } from '../api/mastodonClient.ts';
import { DEFAULT_POST_DESTINATION } from '../components/postDestination.ts';
import { replyParams } from '../components/postSubmission.ts';
import type { PostVisibility } from '../components/postVisibility.ts';
import { resolveReplySubmission, type SendReplyOptions } from './replySubmission.ts';
import { useReplyVisibility } from './useReplyVisibility.ts';

export type UseReplyDialogReturn = Readonly<{
  replyingToPostId: string | null;
  replyingToUsername: string | null;
  replyContent: string;
  replyDestination: PostDestination;
  replyVisibility: PostVisibility;
  replyParentVisibility: Visibility | undefined;
  isSendingReply: boolean;
  openReplyDialog: (postId: string, username?: string, visibility?: Visibility) => void;
  closeReplyDialog: () => void;
  setReplyContent: (content: string) => void;
  setReplyDestination: (destination: PostDestination) => void;
  setReplyVisibility: (visibility: PostVisibility) => void;
  sendReply: (postId: string, content: string, options?: SendReplyOptions) => Promise<boolean>;
}>;

type UseReplyDialogProps = Readonly<{
  onReplySent?: () => void;
}>;

export const useReplyDialog = ({
  onReplySent,
}: UseReplyDialogProps = {}): UseReplyDialogReturn => {
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyDestination, setReplyDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const {
    visibility: replyVisibility,
    parentVisibility: replyParentVisibility,
    setVisibility: setReplyVisibility,
    resetFor: resetVisibilityFor,
    clear: clearVisibility,
  } = useReplyVisibility();

  const openReplyDialog = useCallback((postId: string, username?: string, visibility?: Visibility) => {
    setReplyingToPostId(postId);
    setReplyingToUsername(username ?? null);
    setReplyContent('');
    resetVisibilityFor(visibility);
  }, [resetVisibilityFor]);

  const closeReplyDialog = useCallback(() => {
    setReplyingToPostId(null);
    setReplyingToUsername(null);
    setReplyContent('');
    clearVisibility();
  }, [clearVisibility]);

  const sendReply = useCallback(
    async (postId: string, content: string, options?: SendReplyOptions): Promise<boolean> => {
      setIsSendingReply(true);
      const { destination, visibility, parentVisibility, resetsSharedDraft } = resolveReplySubmission(
        { replyDestination, replyVisibility, replyParentVisibility },
        options,
      );
      try {
        await createStatus(
          replyParams(
            postId,
            content,
            destination,
            parentVisibility === 'direct' ? undefined : visibility,
          ),
        );
        if (resetsSharedDraft) {
          setReplyingToPostId(null);
          setReplyingToUsername(null);
          setReplyContent('');
          setReplyDestination(DEFAULT_POST_DESTINATION);
          clearVisibility();
        }
        onReplySent?.();
        return true;
      } catch (error) {
        console.error('Failed to send reply:', error);
        alert(failureMessage('send reply', error));
        return false;
      } finally {
        setIsSendingReply(false);
      }
    },
    [clearVisibility, onReplySent, replyDestination, replyParentVisibility, replyVisibility],
  );

  return {
    replyingToPostId,
    replyingToUsername,
    replyContent,
    replyDestination,
    replyVisibility,
    replyParentVisibility,
    isSendingReply,
    openReplyDialog,
    closeReplyDialog,
    setReplyContent,
    setReplyDestination,
    setReplyVisibility,
    sendReply,
  } as const;
};
