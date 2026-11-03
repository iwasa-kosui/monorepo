import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Secret } from './secret.ts';

export const OAuthApplicationIdSym = Symbol('OAuthApplicationId');
const applicationIdZodType = z.uuid().brand(OAuthApplicationIdSym).describe('OAuthApplicationId');
export type OAuthApplicationId = z.output<typeof applicationIdZodType>;
const applicationIdSchema = Schema.create<OAuthApplicationId, string>(applicationIdZodType);
export const OAuthApplicationId = {
  ...applicationIdSchema,
  generate: (): OAuthApplicationId => applicationIdSchema.orThrow(crypto.randomUUID()),
} as const;

export const AccessTokenIdSym = Symbol('AccessTokenId');
const accessTokenIdZodType = z.uuid().brand(AccessTokenIdSym).describe('AccessTokenId');
export type AccessTokenId = z.output<typeof accessTokenIdZodType>;
const accessTokenIdSchema = Schema.create<AccessTokenId, string>(accessTokenIdZodType);
export const AccessTokenId = {
  ...accessTokenIdSchema,
  generate: (): AccessTokenId => accessTokenIdSchema.orThrow(crypto.randomUUID()),
} as const;

export const ClientIdSym = Symbol('ClientId');
const clientIdZodType = z.string().regex(/^[A-Za-z0-9_-]{43}$/).brand(ClientIdSym).describe('ClientId');
export type ClientId = z.output<typeof clientIdZodType>;
const clientIdSchema = Schema.create<ClientId, string>(clientIdZodType);
export const ClientId = {
  ...clientIdSchema,
  generate: (): ClientId => clientIdSchema.orThrow(Secret.generate()),
} as const;
