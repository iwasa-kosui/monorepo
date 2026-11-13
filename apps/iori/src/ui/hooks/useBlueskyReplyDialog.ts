import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { type BlueskyReplyResponse, replyToBlueskyPost, replyToBlueskyPostByUri } from '../api/mastodonClient.ts';
import { blueskyReplyErrorMessage } from './blueskyReply.ts';
import { useBlueskyPostDialog, type UseBlueskyPostDialogReturn } from './useBlueskyPostDialog.ts';

export type UseBlueskyReplyDialogReturn = UseBlueskyPostDialogReturn;

export type BlueskyReplySender = (
  item: IoriBlueskyTimelineItemBody,
  text: string,
  mediaIds?: readonly string[],
) => Promise<BlueskyReplyResponse>;

const sendByFeedItemId: BlueskyReplySender = (item, text, mediaIds) =>
  replyToBlueskyPost(item.feedItemId, text, mediaIds);

export const sendBlueskyReplyByUri: BlueskyReplySender = (item, text, mediaIds) =>
  replyToBlueskyPostByUri(item.uri, text, mediaIds);

export const useBlueskyReplyDialog = (
  sendReply: BlueskyReplySender = sendByFeedItemId,
): UseBlueskyReplyDialogReturn =>
  useBlueskyPostDialog({
    submit: sendReply,
    errorMessage: blueskyReplyErrorMessage,
    failureLog: 'Failed to reply to Bluesky post:',
  });
