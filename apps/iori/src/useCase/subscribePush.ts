import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  PushSubscription,
  type PushSubscriptionCreatedStore,
  type PushSubscriptionResolverByEndpoint,
} from '../domain/pushSubscription/pushSubscription.ts';
import { PushSubscriptionId } from '../domain/pushSubscription/pushSubscriptionId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    endpoint: string;
    p256dhKey: string;
    authKey: string;
  }>;

type Ok = Readonly<{
  subscription: PushSubscription;
}>;

export type AlreadySubscribedError = Readonly<{
  type: 'AlreadySubscribedError';
  message: string;
}>;

export const AlreadySubscribedError = {
  create: (): AlreadySubscribedError => ({
    type: 'AlreadySubscribedError',
    message: 'This endpoint is already subscribed.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | AlreadySubscribedError;

export type SubscribePushUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  pushSubscriptionCreatedStore: PushSubscriptionCreatedStore;
  pushSubscriptionResolverByEndpoint: PushSubscriptionResolverByEndpoint;
}>;

const create = (deps: Deps): SubscribePushUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(deps.sessionResolver, deps.userResolver, now);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('existing', ({ endpoint }) => deps.pushSubscriptionResolverByEndpoint.resolve(endpoint)),
      RA.andThen(({ existing, ...rest }) => {
        if (existing) {
          return RA.err(AlreadySubscribedError.create());
        }
        return RA.ok(rest);
      }),
      RA.andBind('subscription', ({ user, endpoint, p256dhKey, authKey }) => {
        const subscription: PushSubscription = {
          subscriptionId: PushSubscriptionId.generate(),
          userId: user.id,
          endpoint,
          p256dhKey,
          authKey,
        };
        const event = PushSubscription.createSubscription(subscription, now);
        return deps.pushSubscriptionCreatedStore.store(event).then(() => RA.ok(subscription));
      }),
      RA.map(({ subscription }) => ({ subscription })),
    );

  return { run };
};

export const SubscribePushUseCase = {
  create,
} as const;
