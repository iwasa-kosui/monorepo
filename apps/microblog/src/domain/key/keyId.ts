import z from "zod";
import { Schema } from "../../helper/schema.ts";

export const KeyIdSym = Symbol('KeyId');
const KeyIdZodType = z.uuid().brand(KeyIdSym).describe('KeyId');
const KeyIdSchema = Schema.create<KeyId, string>(KeyIdZodType);

export type KeyId = z.output<typeof KeyIdZodType>;
export const KeyId = {
  ...KeyIdSchema,
  generate: (): KeyId => {
    const uuid = crypto.randomUUID();
    return KeyIdSchema.orThrow(uuid);
  },
}
