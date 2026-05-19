import { z } from 'zod';

import { BotId } from '../../../domain/bot-id.ts';
import { ChannelId } from '../../../domain/channel-id.ts';
import { Permalink } from '../../../domain/permalink.ts';
import { SlackTs } from '../../../domain/slack-ts.ts';
import { UserId } from '../../../domain/user-id.ts';

export const SearchMessageMatchSchema = z.object({
  type: z.literal('message').optional(),
  ts: SlackTs.schema,
  thread_ts: SlackTs.schema.optional(),
  subtype: z.string().optional(),
  user: UserId.schema.optional(),
  bot_id: BotId.schema.optional(),
  text: z.string().optional(),
  permalink: Permalink.schema,
  channel: z.object({ id: ChannelId.schema }),
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

export type SearchMessagesResponse = z.infer<typeof SearchMessagesResponseSchema>;
