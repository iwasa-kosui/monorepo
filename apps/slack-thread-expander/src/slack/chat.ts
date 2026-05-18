import type { Result } from '@iwasa-kosui/result';

import { callSlack, type SlackApiError, type SlackClient } from './client.ts';
import { type ChatPostMessageResponse, ChatPostMessageResponseSchema } from './schema.ts';

export const chatPostMessage = (
  client: SlackClient,
  params: { channel: string; text: string },
): Result<ChatPostMessageResponse, SlackApiError> =>
  callSlack(
    client,
    'chat.postMessage',
    {
      channel: params.channel,
      text: params.text,
      unfurl_links: true,
      unfurl_media: true,
    },
    ChatPostMessageResponseSchema,
  );
