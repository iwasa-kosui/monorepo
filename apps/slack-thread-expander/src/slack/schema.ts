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

export const ConversationsHistoryResponseSchema = z.object({
  ok: z.boolean(),
  messages: z.array(SlackMessageSchema).optional(),
  has_more: z.boolean().optional(),
  error: z.string().optional(),
});
export type ConversationsHistoryResponse = z.infer<
  typeof ConversationsHistoryResponseSchema
>;

export const ChatGetPermalinkResponseSchema = z.object({
  ok: z.boolean(),
  permalink: z.string().optional(),
  error: z.string().optional(),
});
export type ChatGetPermalinkResponse = z.infer<
  typeof ChatGetPermalinkResponseSchema
>;

export const ChatPostMessageResponseSchema = z.object({
  ok: z.boolean(),
  ts: z.string().optional(),
  error: z.string().optional(),
});
export type ChatPostMessageResponse = z.infer<
  typeof ChatPostMessageResponseSchema
>;
