import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const WebAuthnChallengeIdSym = Symbol('WebAuthnChallengeId');
const zodType = z.uuid().brand(WebAuthnChallengeIdSym).describe('WebAuthnChallengeId');
export type WebAuthnChallengeId = z.output<typeof zodType>;

const schema = Schema.create<WebAuthnChallengeId, string>(zodType);

export const WebAuthnChallengeId = {
  ...schema,
  generate: (): WebAuthnChallengeId => schema.orThrow(crypto.randomUUID()),
} as const;
