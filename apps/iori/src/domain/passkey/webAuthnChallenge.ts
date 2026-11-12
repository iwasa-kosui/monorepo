import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { WebAuthnChallengeId } from './webAuthnChallengeId.ts';

const zodType = z.object({
  challengeId: WebAuthnChallengeId.zodType,
  challenge: z.string().min(1),
  purpose: z.enum(['registration', 'authentication']),
  userId: z.nullable(UserId.zodType),
  expires: Instant.zodType,
}).describe('WebAuthnChallenge');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type WebAuthnChallenge = z.output<typeof zodType>;
export type WebAuthnChallengePurpose = WebAuthnChallenge['purpose'];
export type WebAuthnChallengeAggregate = Agg.Aggregate<WebAuthnChallengeId, 'webAuthnChallenge', WebAuthnChallenge>;
type WebAuthnChallengeEvent<
  TAggregateState extends Agg.InferState<WebAuthnChallengeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<WebAuthnChallengeAggregate, TAggregateState, TEventName, TEventPayload>;

const WebAuthnChallengeEvent = AggregateEvent.createFactory<WebAuthnChallengeAggregate>('webAuthnChallenge');

export type WebAuthnChallengeIssued = WebAuthnChallengeEvent<
  WebAuthnChallenge,
  'webAuthnChallenge.issued',
  Omit<WebAuthnChallenge, 'challengeId'>
>;
export type WebAuthnChallengeConsumed = WebAuthnChallengeEvent<
  undefined,
  'webAuthnChallenge.consumed',
  Readonly<{ challengeId: WebAuthnChallengeId }>
>;

export type WebAuthnChallengeIssuedStore = Agg.Store<WebAuthnChallengeIssued>;
export type WebAuthnChallengeConsumer = Readonly<{
  consume: (challengeId: WebAuthnChallengeId, now: Instant) => RA<WebAuthnChallenge | undefined, never>;
}>;

const LIFETIME_MS = 5 * 60 * 1000;

const issue = (now: Instant) =>
(
  payload: Readonly<{
    challenge: string;
    purpose: WebAuthnChallengePurpose;
    userId: UserId | null;
  }>,
): WebAuthnChallengeIssued => {
  const challengeId = WebAuthnChallengeId.generate();
  const expires = Instant.addDuration(now, LIFETIME_MS);
  return WebAuthnChallengeEvent.create(
    challengeId,
    { ...payload, challengeId, expires },
    'webAuthnChallenge.issued',
    { ...payload, expires },
    now,
  );
};

const consume = (now: Instant) => (challenge: WebAuthnChallenge): WebAuthnChallengeConsumed =>
  WebAuthnChallengeEvent.create(
    challenge.challengeId,
    undefined,
    'webAuthnChallenge.consumed',
    { challengeId: challenge.challengeId },
    now,
  );

export const WebAuthnChallenge = {
  ...schema,
  issue,
  consume,
  isUsable: (
    challenge: WebAuthnChallenge,
    expected: Readonly<{ purpose: WebAuthnChallengePurpose; userId: UserId | null }>,
    now: Instant,
  ): boolean =>
    challenge.expires > now
    && challenge.purpose === expected.purpose
    && challenge.userId === expected.userId,
} as const;

export type WebAuthnChallengeInvalidError = Readonly<{
  type: 'WebAuthnChallengeInvalidError';
  message: string;
  detail: {
    challengeId: WebAuthnChallengeId;
  };
}>;

export const WebAuthnChallengeInvalidError = {
  create: (challengeId: WebAuthnChallengeId): WebAuthnChallengeInvalidError => ({
    type: 'WebAuthnChallengeInvalidError',
    message: `The WebAuthn challenge "${challengeId}" is missing, expired, or not valid for this request.`,
    detail: { challengeId },
  }),
} as const;
