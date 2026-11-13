import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { type BlueskyInteractionParams, quoteBlueskyPost } from '../api/mastodonClient.ts';
import { blueskyQuoteErrorMessage } from './blueskyQuote.ts';
import { useBlueskyPostDialog, type UseBlueskyPostDialogReturn } from './useBlueskyPostDialog.ts';

export type UseBlueskyQuoteDialogReturn = UseBlueskyPostDialogReturn;

const submit = (
  target: IoriBlueskyTimelineItemBody,
  content: string,
  mediaIds: readonly string[],
  interaction?: BlueskyInteractionParams,
) => quoteBlueskyPost(target.uri, content, mediaIds, interaction);

export const useBlueskyQuoteDialog = (): UseBlueskyQuoteDialogReturn =>
  useBlueskyPostDialog({
    submit,
    interactionEnabled: true,
    errorMessage: blueskyQuoteErrorMessage,
    failureLog: 'Failed to quote Bluesky post:',
  });
