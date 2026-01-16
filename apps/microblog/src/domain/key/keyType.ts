import z from 'zod/v4';

import { type InferSchema, Schema } from '../../helper/schema.ts';

const values = {
  rsa: 'RSASSA-PKCS1-v1_5',
  ed25519: 'Ed25519',
} as const;
const schema = Schema.create(z.enum([values.rsa, values.ed25519]));
export type KeyType = InferSchema<typeof schema>;
export const KeyType = {
  ...schema,
  ...values,
  values: Object.values(values),
} as const;
