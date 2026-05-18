import { z } from 'zod';

export const SlackMessageSchema = z.object({
  type: z.literal('message'),
  ts: z.string(),
  thread_ts: z.string().optional(),
  subtype: z.string().optional(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  text: z.string().optional(),
});
export type SlackMessage = z.infer<typeof SlackMessageSchema>;

export const SearchMessageMatchSchema = z.object({
  type: z.literal('message').optional(),
  ts: z.string(),
  thread_ts: z.string().optional(),
  subtype: z.string().optional(),
  user: z.string().optional(),
  bot_id: z.string().optional(),
  text: z.string().optional(),
  permalink: z.string(),
  channel: z.object({ id: z.string() }),
});
export type SearchMessageMatch = z.infer<typeof SearchMessageMatchSchema>;

export const SearchMessagesResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  messages: z
    .object({
      total: z.number().optional(),
      matches: z.array(SearchMessageMatchSchema).optional(),
    })
    .optional(),
});
export type SearchMessagesResponse = z.infer<
  typeof SearchMessagesResponseSchema
>;

export const ConversationsInfoResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  channel: z
    .object({
      id: z.string(),
      name: z.string(),
      is_private: z.boolean().optional(),
    })
    .optional(),
});
export type ConversationsInfoResponse = z.infer<
  typeof ConversationsInfoResponseSchema
>;

export const ChatPostMessageResponseSchema = z.object({
  ok: z.boolean(),
  ts: z.string().optional(),
  error: z.string().optional(),
});
export type ChatPostMessageResponse = z.infer<
  typeof ChatPostMessageResponseSchema
>;
