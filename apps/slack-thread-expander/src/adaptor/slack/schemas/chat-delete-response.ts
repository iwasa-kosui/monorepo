import { z } from 'zod';

export const ChatDeleteResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

export type ChatDeleteResponse = z.infer<typeof ChatDeleteResponseSchema>;
