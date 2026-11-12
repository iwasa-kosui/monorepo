import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const PasskeyCredentialIdSym = Symbol('PasskeyCredentialId');
const zodType = z.string().min(1).max(1023).regex(/^[A-Za-z0-9_-]+$/).brand(PasskeyCredentialIdSym).describe(
  'PasskeyCredentialId',
);
export type PasskeyCredentialId = z.output<typeof zodType>;

const schema = Schema.create<PasskeyCredentialId, string>(zodType);

export const PasskeyCredentialId = {
  ...schema,
} as const;
