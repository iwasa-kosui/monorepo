import { z } from 'zod';

import { SlackTs } from '../../../domain/slack-ts.ts';

export const ConversationsHistoryMessageSchema = z.object({
  type: z.literal('message').optional(),
  ts: SlackTs.schema,
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
