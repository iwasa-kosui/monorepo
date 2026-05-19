import { z } from 'zod';

export const BotIdBrand = Symbol('BotId');
const BotIdSchema = z.string().min(1).brand<typeof BotIdBrand>();
export type BotId = z.infer<typeof BotIdSchema>;

export const BotId = {
  schema: BotIdSchema,
  parse: (raw: unknown) => BotIdSchema.safeParse(raw),
} as const;
