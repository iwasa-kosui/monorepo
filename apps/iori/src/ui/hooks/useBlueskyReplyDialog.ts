import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { replyToBlueskyPost } from '../api/mastodonClient.ts';
import { blueskyReplyErrorMessage } from './blueskyReply.ts';
import { useBlueskyPostDialog, type UseBlueskyPostDialogReturn } from './useBlueskyPostDialog.ts';

export type UseBlueskyReplyDialogReturn = UseBlueskyPostDialogReturn;

const submit = (target: IoriBlueskyTimelineItemBody, content: string) => replyToBlueskyPost(target.feedItemId, content);

export const useBlueskyReplyDialog = (): UseBlueskyReplyDialogReturn =>
  useBlueskyPostDialog({
    submit,
    errorMessage: blueskyReplyErrorMessage,
    failureLog: 'Failed to reply to Bluesky post:',
  });
