import { z } from 'zod';

import { SlackTs } from '../../../domain/slack-ts.ts';

export const ChatPostMessageResponseSchema = z.object({
  ok: z.boolean(),
  ts: SlackTs.schema.optional(),
  error: z.string().optional(),
});

export type ChatPostMessageResponse = z.infer<typeof ChatPostMessageResponseSchema>;
