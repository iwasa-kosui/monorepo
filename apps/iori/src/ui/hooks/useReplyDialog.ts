import { useCallback, useState } from 'hono/jsx';

import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import { createStatus, failureMessage } from '../api/mastodonClient.ts';
import { DEFAULT_POST_DESTINATION } from '../components/postDestination.ts';
import { replyParams } from '../components/postSubmission.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility, replyVisibilityDefault } from '../components/postVisibility.ts';

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
  sendReply: (postId: string, content: string) => Promise<boolean>;
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
  const [replyVisibility, setReplyVisibility] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);
  const [replyParentVisibility, setReplyParentVisibility] = useState<Visibility | undefined>(undefined);
  const [isSendingReply, setIsSendingReply] = useState(false);

  const openReplyDialog = useCallback((postId: string, username?: string, visibility?: Visibility) => {
    setReplyingToPostId(postId);
    setReplyingToUsername(username ?? null);
    setReplyContent('');
    setReplyParentVisibility(visibility);
    setReplyVisibility(replyVisibilityDefault(visibility));
  }, []);

  const closeReplyDialog = useCallback(() => {
    setReplyingToPostId(null);
    setReplyingToUsername(null);
    setReplyContent('');
    setReplyParentVisibility(undefined);
    setReplyVisibility(DEFAULT_POST_VISIBILITY);
  }, []);

  const sendReply = useCallback(
    async (postId: string, content: string): Promise<boolean> => {
      setIsSendingReply(true);
      try {
        await createStatus(
          replyParams(
            postId,
            content,
            replyDestination,
            replyParentVisibility === 'direct' ? undefined : replyVisibility,
          ),
        );
        setReplyingToPostId(null);
        setReplyingToUsername(null);
        setReplyContent('');
        setReplyDestination(DEFAULT_POST_DESTINATION);
        setReplyParentVisibility(undefined);
        setReplyVisibility(DEFAULT_POST_VISIBILITY);
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
    [onReplySent, replyDestination, replyParentVisibility, replyVisibility],
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
