import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { quoteBlueskyPost } from '../api/mastodonClient.ts';
import { blueskyQuoteErrorMessage } from './blueskyQuote.ts';
import { useBlueskyPostDialog, type UseBlueskyPostDialogReturn } from './useBlueskyPostDialog.ts';

export type UseBlueskyQuoteDialogReturn = UseBlueskyPostDialogReturn;

const submit = (target: IoriBlueskyTimelineItemBody, content: string, mediaIds: readonly string[]) =>
  quoteBlueskyPost(target.uri, content, mediaIds);

export const useBlueskyQuoteDialog = (): UseBlueskyQuoteDialogReturn =>
  useBlueskyPostDialog({
    submit,
    errorMessage: blueskyQuoteErrorMessage,
    failureLog: 'Failed to quote Bluesky post:',
  });
