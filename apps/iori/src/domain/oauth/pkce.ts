import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Secret } from './secret.ts';

const pattern = /^[A-Za-z0-9\-._~]{43,128}$/;

export const CodeChallengeSym = Symbol('CodeChallenge');
const challengeZodType = z.string().regex(pattern).brand(CodeChallengeSym).describe('CodeChallenge');
export type CodeChallenge = z.output<typeof challengeZodType>;
const challengeSchema = Schema.create<CodeChallenge, string>(challengeZodType);

export const CodeChallengeMethodSchema = z.literal('S256');
export type CodeChallengeMethod = z.output<typeof CodeChallengeMethodSchema>;

const verify = async (challenge: CodeChallenge, verifier: string): Promise<boolean> => {
  if (!pattern.test(verifier)) return false;
  const computed = Secret.toBase64Url(await Secret.sha256(verifier));
  return Secret.timingSafeEqual(computed, challenge);
};

export const CodeChallenge = {
  ...challengeSchema,
  verify,
} as const;
