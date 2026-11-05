import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const DigestDeepDiveIdSym = Symbol('DigestDeepDiveId');
const zodType = z.uuid().brand(DigestDeepDiveIdSym).describe('DigestDeepDiveId');
export type DigestDeepDiveId = z.output<typeof zodType>;

const schema = Schema.create<DigestDeepDiveId, string>(zodType);

export const DigestDeepDiveId = {
  ...schema,
  generate: (): DigestDeepDiveId => schema.orThrow(crypto.randomUUID()),
} as const;

export const DigestDeepDiveTurnIdSym = Symbol('DigestDeepDiveTurnId');
const turnZodType = z.uuid().brand(DigestDeepDiveTurnIdSym).describe('DigestDeepDiveTurnId');
export type DigestDeepDiveTurnId = z.output<typeof turnZodType>;

const turnSchema = Schema.create<DigestDeepDiveTurnId, string>(turnZodType);

export const DigestDeepDiveTurnId = {
  ...turnSchema,
  generate: (): DigestDeepDiveTurnId => turnSchema.orThrow(crypto.randomUUID()),
} as const;
