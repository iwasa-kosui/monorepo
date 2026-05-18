import type { Result } from '@iwasa-kosui/result';

import { callSlack, type SlackApiError, type SlackClient } from './client.ts';
import { type ConversationsInfoResponse, ConversationsInfoResponseSchema } from './schema.ts';

export const conversationsInfo = (
  client: SlackClient,
  channel: string,
): Result<ConversationsInfoResponse, SlackApiError> =>
  callSlack(
    client,
    'conversations.info',
    { channel },
    ConversationsInfoResponseSchema,
  );
