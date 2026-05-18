import type { Result } from '@iwasa-kosui/result';

import { callSlack, type SlackApiError, type SlackClient } from './client.ts';
import {
  type ChatGetPermalinkResponse,
  ChatGetPermalinkResponseSchema,
  type ChatPostMessageResponse,
  ChatPostMessageResponseSchema,
} from './schema.ts';

export const chatGetPermalink = (
  client: SlackClient,
  params: { channel: string; messageTs: string },
): Result<ChatGetPermalinkResponse, SlackApiError> =>
  callSlack(
    client,
    'chat.getPermalink',
    { channel: params.channel, message_ts: params.messageTs },
    ChatGetPermalinkResponseSchema,
  );

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
