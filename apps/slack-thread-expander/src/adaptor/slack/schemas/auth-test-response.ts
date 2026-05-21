import { z } from 'zod';

import { BotId } from '../../../domain/bot-id.ts';
import { UserId } from '../../../domain/user-id.ts';

export const AuthTestResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  url: z.string().optional(),
  team: z.string().optional(),
  team_id: z.string().optional(),
  user: z.string().optional(),
  user_id: UserId.schema.optional(),
  bot_id: BotId.schema.optional(),
});

export type AuthTestResponse = z.infer<typeof AuthTestResponseSchema>;
