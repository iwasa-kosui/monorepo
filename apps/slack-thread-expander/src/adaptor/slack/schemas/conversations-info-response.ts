import { z } from 'zod';

import { ChannelId } from '../../../domain/channel-id.ts';

export const ConversationsInfoResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  channel: z
    .object({
      id: ChannelId.schema,
      name: z.string(),
      is_private: z.boolean().optional(),
    })
    .optional(),
});

export type ConversationsInfoResponse = z.infer<typeof ConversationsInfoResponseSchema>;
