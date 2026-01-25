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
  await ctx.sendActivity(
    { identifier: INSTANCE_ACTOR_IDENTIFIER },
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

const create = ({
  relayResolverByActorUri,
  relaySubscriptionRequestedStore,
}: Deps): SubscribeRelayUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingRelay', ({ relayActorUri }) => relayResolverByActorUri.resolve({ actorUri: relayActorUri })),
      RA.andThen(async ({ existingRelay, relayActorUri, ctx }) => {
        // If relay already exists, resend Follow activity and return existing relay
        if (existingRelay) {
          await sendFollowActivity(ctx, existingRelay);
          return RA.ok(existingRelay);
        }

        // Look up relay actor
        const documentLoader = await ctx.getDocumentLoader({ identifier: INSTANCE_ACTOR_IDENTIFIER });
        let relayActor: { inboxUrl: string; actorUri: string };
        try {
          const response = await documentLoader(relayActorUri);
          const json = await response.document;
          if (!json || typeof json !== 'object') {
            return RA.err(RelayActorLookupError.create({ actorUri: relayActorUri }));
          }
          const actorData = json as { inbox?: string; id?: string };
          if (!actorData.inbox || !actorData.id) {
            return RA.err(RelayActorLookupError.create({ actorUri: relayActorUri }));
          }
          relayActor = {
            inboxUrl: actorData.inbox,
            actorUri: actorData.id,
          };
        } catch {
          return RA.err(RelayActorLookupError.create({ actorUri: relayActorUri }));
        }

        // Create new relay
        const event = Relay.requestSubscription(
          {
            relayId: RelayId.generate(),
            inboxUrl: relayActor.inboxUrl,
            actorUri: relayActor.actorUri,
            createdAt: now,
          },
          now,
        );

        await relaySubscriptionRequestedStore.store(event);

        const relay = event.aggregateState;
        await sendFollowActivity(ctx, relay);

        return RA.ok(relay);
      }),
    );

  return { run };
};

export const SubscribeRelayUseCase = {
  create,
} as const;
