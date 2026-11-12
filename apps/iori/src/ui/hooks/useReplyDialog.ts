import { useCallback, useState } from 'hono/jsx';

import type { PostDestination } from '../../domain/post/postDestination.ts';
import { createStatus, failureMessage } from '../api/mastodonClient.ts';
import { DEFAULT_POST_DESTINATION } from '../components/postDestination.ts';
import { replyParams } from '../components/postSubmission.ts';

export type UseReplyDialogReturn = Readonly<{
  replyingToPostId: string | null;
  replyContent: string;
  replyDestination: PostDestination;
  isSendingReply: boolean;
  openReplyDialog: (postId: string) => void;
  closeReplyDialog: () => void;
  setReplyContent: (content: string) => void;
  setReplyDestination: (destination: PostDestination) => void;
  sendReply: (postId: string, content: string) => Promise<boolean>;
}>;

type UseReplyDialogProps = Readonly<{
  onReplySent?: () => void;
}>;

export const useReplyDialog = ({
  onReplySent,
}: UseReplyDialogProps = {}): UseReplyDialogReturn => {
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyDestination, setReplyDestination] = useState<PostDestination>(DEFAULT_POST_DESTINATION);
  const [isSendingReply, setIsSendingReply] = useState(false);

  const openReplyDialog = useCallback((postId: string) => {
    setReplyingToPostId(postId);
    setReplyContent('');
  }, []);

  const closeReplyDialog = useCallback(() => {
    setReplyingToPostId(null);
    setReplyContent('');
  }, []);

  const sendReply = useCallback(
    async (postId: string, content: string): Promise<boolean> => {
      setIsSendingReply(true);
      try {
        await createStatus(replyParams(postId, content, replyDestination));
        setReplyingToPostId(null);
        setReplyContent('');
        setReplyDestination(DEFAULT_POST_DESTINATION);
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
    [onReplySent, replyDestination],
  );

  return {
    replyingToPostId,
    replyContent,
    replyDestination,
    isSendingReply,
    openReplyDialog,
    closeReplyDialog,
    setReplyContent,
    setReplyDestination,
    sendReply,
  } as const;
};
