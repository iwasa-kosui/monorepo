import { z } from 'zod';

import { BotId } from '../../../domain/bot-id.ts';
import { SlackTs } from '../../../domain/slack-ts.ts';
import { UserId } from '../../../domain/user-id.ts';

export const ConversationsHistoryMessageSchema = z.object({
  type: z.literal('message').optional(),
  ts: SlackTs.schema,
  subtype: z.string().optional(),
  user: UserId.schema.optional(),
  bot_id: BotId.schema.optional(),
});

export type ConversationsHistoryMessage = z.infer<
  typeof ConversationsHistoryMessageSchema
>;

export const ConversationsHistoryResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  messages: z.array(ConversationsHistoryMessageSchema).optional(),
  has_more: z.boolean().optional(),
  response_metadata: z
    .object({ next_cursor: z.string().optional() })
    .optional(),
});

export type ConversationsHistoryResponse = z.infer<
  typeof ConversationsHistoryResponseSchema
>;
