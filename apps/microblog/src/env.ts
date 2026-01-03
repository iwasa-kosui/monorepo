import z from "zod";
import { singleton } from "./helper/singleton.ts";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
}).readonly();

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
