import z from "zod/v4";
import { singleton } from "./helper/singleton.ts";

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const devSchema = baseSchema.extend({
  ORIGIN: z.undefined().optional(),
  APP_ENV: z.literal('development'),
  DATABASE_CERT: z.undefined().optional(),
}).readonly();

const prodSchema = baseSchema.extend({
  ORIGIN: z.string().min(1),
  APP_ENV: z.literal('production'),
  DATABASE_CERT: z.string().min(1),
}).readonly();

const schema = z.union([devSchema, prodSchema]);

export type Env = z.infer<typeof schema>;

const create = (): Env => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${parsed.error.message}`);
  }
  return parsed.data;
}

const getInstance = singleton(create);

export const Env = {
  getInstance,
} as const;
