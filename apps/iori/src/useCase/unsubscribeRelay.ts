import { Follow, type RequestContext, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import { INSTANCE_ACTOR_IDENTIFIER } from '../adaptor/fedify/sharedKeyDispatcher.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Relay, RelayNotFoundError, type RelayResolver, type RelayUnsubscribedStore } from '../domain/relay/relay.ts';
import type { RelayId } from '../domain/relay/relayId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  relayId: RelayId;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

type Err = RelayNotFoundError;

export type UnsubscribeRelayUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  relayResolver: RelayResolver;
  relayUnsubscribedStore: RelayUnsubscribedStore;
}>;

const create = ({
  relayResolver,
  relayUnsubscribedStore,
}: Deps): UnsubscribeRelayUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('relay', ({ relayId }) =>
        RA.flow(
          relayResolver.resolve({ relayId }),
          RA.andThen((relay) =>
            relay
              ? RA.ok(relay)
              : RA.err(RelayNotFoundError.create({ relayId }))
          ),
        )),
      RA.andThrough(async ({ relay, ctx }) => {
        // Get key pairs directly to ensure proper signing
        const keys = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);
        await ctx.sendActivity(
          keys,
          {
            id: new URL(relay.actorUri),
            inboxId: new URL(relay.inboxUrl),
          },
          new Undo({
            actor: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
            object: new Follow({
              actor: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
              object: new URL(relay.actorUri),
            }),
            to: new URL(relay.actorUri),
          }),
        );
        return RA.ok(undefined);
      }),
      RA.andThrough(({ relay }) => {
        const event = Relay.unsubscribe(relay, now);
        return relayUnsubscribedStore.store(event);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UnsubscribeRelayUseCase = {
  create,
} as const;
