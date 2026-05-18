import type { Result } from '@iwasa-kosui/result';

import { callSlack, type SlackApiError, type SlackClient } from './client.ts';
import { type ConversationsHistoryResponse, ConversationsHistoryResponseSchema } from './schema.ts';

export type HistoryParams = {
  channel: string;
  oldest: string;
  limit?: number;
};

export const conversationsHistory = (
  client: SlackClient,
  params: HistoryParams,
): Result<ConversationsHistoryResponse, SlackApiError> =>
  callSlack(
    client,
    'conversations.history',
    {
      channel: params.channel,
      oldest: params.oldest,
      inclusive: false,
      limit: params.limit ?? 200,
    },
    ConversationsHistoryResponseSchema,
  );
