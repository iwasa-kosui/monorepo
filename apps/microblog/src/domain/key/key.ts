import z from 'zod/v4';

import { type InferSchema, Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { UserId } from '../user/userId.ts';
import { generate } from './generate.ts';
import { KeyId } from './keyId.ts';
import { KeyType } from './keyType.ts';

const schema = Schema.create(z.object({
  id: KeyId.zodType,
  type: KeyType.zodType,
  userId: UserId.zodType,
  privateKey: z.string().min(1).describe('PrivateKey'),
  publicKey: z.string().min(1).describe('PublicKey'),
}));

export const Key = {
  ...schema,
  generate,
} as const;
export type Key = InferSchema<typeof schema>;

export type KeysResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<Key>>;
