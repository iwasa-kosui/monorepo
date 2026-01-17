import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  PushSubscription,
  type PushSubscriptionDeletedStore,
  type PushSubscriptionResolverByEndpoint,
} from '../domain/pushSubscription/pushSubscription.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  endpoint: string;
}>;

type Ok = Readonly<{
  success: boolean;
}>;

export type SubscriptionNotFoundError = Readonly<{
  type: 'SubscriptionNotFoundError';
  message: string;
}>;

export const SubscriptionNotFoundError = {
  create: (): SubscriptionNotFoundError => ({
    type: 'SubscriptionNotFoundError',
    message: 'Subscription not found.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | SubscriptionNotFoundError;

export type UnsubscribePushUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  pushSubscriptionDeletedStore: PushSubscriptionDeletedStore;
  pushSubscriptionResolverByEndpoint: PushSubscriptionResolverByEndpoint;
}>;

const create = (deps: Deps): UnsubscribePushUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(deps.sessionResolver, now);
  const resolveUser = resolveUserWith(deps.userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('existing', ({ endpoint }) => deps.pushSubscriptionResolverByEndpoint.resolve(endpoint)),
      RA.andThen(({ existing, user, ...rest }) => {
        if (!existing) {
          return RA.err(SubscriptionNotFoundError.create());
        }
        if (existing.userId !== user.id) {
          return RA.err(SubscriptionNotFoundError.create());
        }
        return RA.ok({ ...rest, existing, user });
      }),
      RA.andThrough(({ existing }) => {
        const event = PushSubscription.deleteSubscription(existing.subscriptionId, now);
        return deps.pushSubscriptionDeletedStore.store(event);
      }),
      RA.map(() => ({ success: true })),
    );

  return { run };
};

export const UnsubscribePushUseCase = {
  create,
} as const;
