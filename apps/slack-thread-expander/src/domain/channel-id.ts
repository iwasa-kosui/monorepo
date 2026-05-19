import { z } from 'zod';

export const ChannelIdBrand = Symbol('ChannelId');
const ChannelIdSchema = z.string().min(1).brand<typeof ChannelIdBrand>();
export type ChannelId = z.infer<typeof ChannelIdSchema>;

export const ChannelId = {
  schema: ChannelIdSchema,
  parse: (raw: unknown) => ChannelIdSchema.safeParse(raw),
} as const;
