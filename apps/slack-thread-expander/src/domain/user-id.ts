import { z } from 'zod';

export const UserIdBrand = Symbol('UserId');
const UserIdSchema = z.string().min(1).brand<typeof UserIdBrand>();
export type UserId = z.infer<typeof UserIdSchema>;

export const UserId = {
  schema: UserIdSchema,
  parse: (raw: unknown) => UserIdSchema.safeParse(raw),
} as const;
