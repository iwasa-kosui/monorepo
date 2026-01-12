import z from "zod/v4";
import { Schema } from "../../helper/schema.ts";

export const HandleSym = Symbol('Handle');
const zodType = z.string().min(1).brand(HandleSym).describe('Handle');

export type Handle = z.infer<typeof zodType>;
const schema = Schema.create(zodType)

export const Handle = {
  ...schema
} as const;
