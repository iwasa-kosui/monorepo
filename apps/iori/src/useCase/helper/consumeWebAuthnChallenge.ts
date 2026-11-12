import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../domain/instant/instant.ts';
import {
  WebAuthnChallenge,
  type WebAuthnChallengeConsumer,
  WebAuthnChallengeInvalidError,
  type WebAuthnChallengePurpose,
} from '../../domain/passkey/webAuthnChallenge.ts';
import type { WebAuthnChallengeId } from '../../domain/passkey/webAuthnChallengeId.ts';
import type { UserId } from '../../domain/user/userId.ts';

export const consumeWebAuthnChallengeWith = (consumer: WebAuthnChallengeConsumer, now: Instant) =>
(
  challengeId: WebAuthnChallengeId,
  expected: Readonly<{ purpose: WebAuthnChallengePurpose; userId: UserId | null }>,
): RA<WebAuthnChallenge, WebAuthnChallengeInvalidError> =>
  RA.flow(
    consumer.consume(challengeId, now),
    RA.andThen((challenge) =>
      challenge !== undefined && WebAuthnChallenge.isUsable(challenge, expected, now)
        ? RA.ok(challenge)
        : RA.err(WebAuthnChallengeInvalidError.create(challengeId))
    ),
  );
