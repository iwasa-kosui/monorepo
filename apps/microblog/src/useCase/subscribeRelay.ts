import { Follow, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import { INSTANCE_ACTOR_IDENTIFIER } from '../adaptor/fedify/sharedKeyDispatcher.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Relay,
  RelayActorLookupError,
  RelayAlreadyExistsError,
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

type Err = RelayAlreadyExistsError | RelayActorLookupError;

export type SubscribeRelayUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  relayResolverByActorUri: RelayResolverByActorUri;
  relaySubscriptionRequestedStore: RelaySubscriptionRequestedStore;
}>;

const create = ({
  relayResolverByActorUri,
  relaySubscriptionRequestedStore,
}: Deps): SubscribeRelayUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingRelay', ({ relayActorUri }) => relayResolverByActorUri.resolve({ actorUri: relayActorUri })),
      RA.andThen(({ existingRelay, relayActorUri, ctx }) =>
        existingRelay
          ? RA.err(RelayAlreadyExistsError.create({ actorUri: relayActorUri }))
          : RA.ok({ relayActorUri, ctx })
      ),
      RA.andBind('relayActor', async ({ relayActorUri, ctx }) => {
        const documentLoader = await ctx.getDocumentLoader({ identifier: INSTANCE_ACTOR_IDENTIFIER });
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
          return RA.ok({
            inboxUrl: actorData.inbox,
            actorUri: actorData.id,
          });
        } catch {
          return RA.err(RelayActorLookupError.create({ actorUri: relayActorUri }));
        }
      }),
      RA.andBind('relay', ({ relayActor }) => {
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
      RA.andThrough(async ({ relay, ctx }) => {
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
        return RA.ok(undefined);
      }),
      RA.map(({ relay }) => relay),
    );

  return { run };
};

export const SubscribeRelayUseCase = {
  create,
} as const;
