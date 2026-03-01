import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Relay,
  RelayNotFoundError,
  type RelayResolverByActorUri,
  type RelaySubscriptionAcceptedStore,
} from '../domain/relay/relay.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  relayActorUri: string;
}>;

type Ok = Relay;

type Err = RelayNotFoundError;

export type AcceptRelaySubscriptionUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  relayResolverByActorUri: RelayResolverByActorUri;
  relaySubscriptionAcceptedStore: RelaySubscriptionAcceptedStore;
}>;

const create = ({
  relayResolverByActorUri,
  relaySubscriptionAcceptedStore,
}: Deps): AcceptRelaySubscriptionUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingRelay', ({ relayActorUri }) => relayResolverByActorUri.resolve({ actorUri: relayActorUri })),
      RA.andThen(({ existingRelay, relayActorUri }) =>
        existingRelay
          ? RA.ok(existingRelay)
          : RA.err(RelayNotFoundError.create({ actorUri: relayActorUri }))
      ),
      RA.andBind('acceptedRelay', (relay) => {
        const event = Relay.acceptSubscription(relay, now);
        return RA.flow(
          relaySubscriptionAcceptedStore.store(event),
          RA.map(() => event.aggregateState),
        );
      }),
      RA.map(({ acceptedRelay }) => acceptedRelay),
    );

  return { run };
};

export const AcceptRelaySubscriptionUseCase = {
  create,
} as const;
