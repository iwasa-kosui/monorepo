import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { PasskeyCredentialId } from './passkeyCredentialId.ts';

const zodType = z.object({
  credentialId: PasskeyCredentialId.zodType,
  userId: UserId.zodType,
  publicKey: z.string().min(1),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string().min(1)),
  deviceType: z.enum(['singleDevice', 'multiDevice']),
  backedUp: z.boolean(),
  name: z.string().min(1).max(100),
  createdAt: Instant.zodType,
  lastUsedAt: z.nullable(Instant.zodType),
}).describe('PasskeyCredential');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type PasskeyCredential = z.output<typeof zodType>;
export type PasskeyCredentialAggregate = Agg.Aggregate<PasskeyCredentialId, 'passkeyCredential', PasskeyCredential>;
type PasskeyCredentialEvent<
  TAggregateState extends Agg.InferState<PasskeyCredentialAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<PasskeyCredentialAggregate, TAggregateState, TEventName, TEventPayload>;

const PasskeyCredentialEvent = AggregateEvent.createFactory<PasskeyCredentialAggregate>('passkeyCredential');

export type PasskeyRegistered = PasskeyCredentialEvent<
  PasskeyCredential,
  'passkeyCredential.registered',
  PasskeyCredential
>;
export type PasskeyUsedPayload = Readonly<{
  credentialId: PasskeyCredentialId;
  counter: number;
  lastUsedAt: Instant;
}>;
export type PasskeyUsed = PasskeyCredentialEvent<
  PasskeyCredential,
  'passkeyCredential.used',
  PasskeyUsedPayload
>;
export type PasskeyDeletedPayload = Readonly<{
  credentialId: PasskeyCredentialId;
  userId: UserId;
}>;
export type PasskeyDeleted = PasskeyCredentialEvent<
  undefined,
  'passkeyCredential.deleted',
  PasskeyDeletedPayload
>;

export type PasskeyRegisteredStore = Agg.Store<PasskeyRegistered>;
export type PasskeyUsedStore = Agg.Store<PasskeyUsed>;
export type PasskeyDeletedStore = Agg.Store<PasskeyDeleted>;
export type PasskeyCredentialResolverByCredentialId = Agg.Resolver<
  PasskeyCredentialId,
  PasskeyCredential | undefined
>;
export type PasskeyCredentialsResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<PasskeyCredential>>;

const register =
  (now: Instant) => (payload: Omit<PasskeyCredential, 'createdAt' | 'lastUsedAt'>): PasskeyRegistered => {
    const credential: PasskeyCredential = { ...payload, createdAt: now, lastUsedAt: null };
    return PasskeyCredentialEvent.create(
      credential.credentialId,
      credential,
      'passkeyCredential.registered',
      credential,
      now,
    );
  };

const use = (now: Instant) => (credential: PasskeyCredential, newCounter: number): PasskeyUsed => {
  const used: PasskeyCredential = { ...credential, counter: newCounter, lastUsedAt: now };
  return PasskeyCredentialEvent.create(
    credential.credentialId,
    used,
    'passkeyCredential.used',
    { credentialId: credential.credentialId, counter: newCounter, lastUsedAt: now },
    now,
  );
};

const remove = (now: Instant) => (credential: PasskeyCredential): PasskeyDeleted =>
  PasskeyCredentialEvent.create(
    credential.credentialId,
    undefined,
    'passkeyCredential.deleted',
    { credentialId: credential.credentialId, userId: credential.userId },
    now,
  );

export const PasskeyCredential = {
  ...schema,
  register,
  use,
  remove,
} as const;

export type PasskeyCredentialNotFoundError = Readonly<{
  type: 'PasskeyCredentialNotFoundError';
  message: string;
  detail: {
    credentialId: string;
  };
}>;

export const PasskeyCredentialNotFoundError = {
  create: (credentialId: string): PasskeyCredentialNotFoundError => ({
    type: 'PasskeyCredentialNotFoundError',
    message: `The passkey credential "${credentialId}" was not found.`,
    detail: { credentialId },
  }),
} as const;

export type PasskeyVerificationFailedError = Readonly<{
  type: 'PasskeyVerificationFailedError';
  message: string;
}>;

export const PasskeyVerificationFailedError = {
  create: (reason: string): PasskeyVerificationFailedError => ({
    type: 'PasskeyVerificationFailedError',
    message: `The passkey response could not be verified: ${reason}`,
  }),
} as const;
