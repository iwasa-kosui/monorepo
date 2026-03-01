import { Follow, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import { INSTANCE_ACTOR_IDENTIFIER } from '../adaptor/fedify/sharedKeyDispatcher.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Relay,
  RelayActorLookupError,
  type RelayResolverByActorUri,
  type RelaySubscriptionRequestedStore,
} from '../domain/relay/relay.ts';
import { RelayId } from '../domain/relay/relayId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  relayActorUri: string;
  ctx: RequestContext<unknown>;
}>;

type Ok = Relay;

type Err = RelayActorLookupError;

export type SubscribeRelayUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  relayResolverByActorUri: RelayResolverByActorUri;
  relaySubscriptionRequestedStore: RelaySubscriptionRequestedStore;
}>;

const sendFollowActivity = async (
  ctx: RequestContext<unknown>,
  relay: Relay,
): Promise<void> => {
  // Get key pairs directly to ensure proper signing
  const keys = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);
  await ctx.sendActivity(
    keys,
    {
      id: new URL(relay.actorUri),
      inboxId: new URL(relay.inboxUrl),
    },
    new Follow({
      actor: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
      object: new URL('https://www.w3.org/ns/activitystreams#Public'),
      to: new URL('https://www.w3.org/ns/activitystreams#Public'),
    }),
  );
};

const lookupRelayActor = (
  ctx: RequestContext<unknown>,
  relayActorUri: string,
) =>
  RA.tryFn(async () => {
    const documentLoader = await ctx.getDocumentLoader({ identifier: INSTANCE_ACTOR_IDENTIFIER });
    const response = await documentLoader(relayActorUri);
    const json = await response.document;
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid response');
    }
    const actorData = json as { inbox?: string; id?: string };
    if (!actorData.inbox || !actorData.id) {
      throw new Error('Missing inbox or id');
    }
    return {
      inboxUrl: actorData.inbox,
      actorUri: actorData.id,
    };
  }, () => RelayActorLookupError.create({ actorUri: relayActorUri }))();

const create = ({
  relayResolverByActorUri,
  relaySubscriptionRequestedStore,
}: Deps): SubscribeRelayUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingRelay', ({ relayActorUri }) => relayResolverByActorUri.resolve({ actorUri: relayActorUri })),
      RA.andThen(({ existingRelay, relayActorUri, ctx }) => {
        // If relay already exists, resend Follow activity and return existing relay
        if (existingRelay) {
          return RA.flow(
            RA.ok(existingRelay),
            RA.andThrough((relay) => sendFollowActivity(ctx, relay).then(() => RA.ok(undefined))),
          );
        }
        // Otherwise, look up actor and create new relay
        return RA.flow(
          lookupRelayActor(ctx, relayActorUri),
          RA.andBind('relay', (relayActor) => {
            const event = Relay.requestSubscription(
              {
                relayId: RelayId.generate(),
                inboxUrl: relayActor.inboxUrl,
                actorUri: relayActor.actorUri,
                createdAt: now,
              },
              now,
            );
            return RA.flow(
              relaySubscriptionRequestedStore.store(event),
              RA.map(() => event.aggregateState),
            );
          }),
          RA.andThrough(({ relay }) => sendFollowActivity(ctx, relay).then(() => RA.ok(undefined))),
          RA.map(({ relay }) => relay),
        );
      }),
    );

  return { run };
};

export const SubscribeRelayUseCase = {
  create,
} as const;
