import { RA } from '@iwasa-kosui/result';

import { PgActorResolverByUri } from '../../adaptor/pg/actor/actorResolverByUri.ts';
import { Actor } from '../../domain/actor/actor.ts';
import { RemoteActor, type RemoteActorCreatedStore } from '../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../domain/actor/updateLogoUri.ts';
import type { Instant } from '../../domain/instant/instant.ts';

type Identity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type Dependencies = Readonly<{
  now: Instant;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
}>;

export const upsertRemoteActor =
  ({ now, remoteActorCreatedStore, logoUriUpdatedStore }: Dependencies) => (identity: Identity): RA<Actor, never> =>
    RA.flow(
      RA.ok({ identity }),
      RA.andBind('existing', ({ identity: { uri } }) => PgActorResolverByUri.getInstance().resolve(uri)),
      RA.andThen(({ existing, identity }) => {
        if (!existing) {
          return RA.flow(
            RA.ok(RemoteActor.createRemoteActor(identity)),
            RA.andThrough(remoteActorCreatedStore.store),
            RA.map((event) => event.aggregateState),
          );
        }
        return RA.flow(
          RA.ok(existing),
          RA.andThen((actor) => {
            if (identity.logoUri && actor.logoUri !== identity.logoUri) {
              return RA.flow(
                RA.ok(Actor.updateLogoUri(now)(actor, identity.logoUri)),
                RA.andThrough(logoUriUpdatedStore.store),
                RA.map(() => ({
                  ...actor,
                  logoUri: identity.logoUri!,
                })),
              );
            }
            return RA.ok(actor);
          }),
        );
      }),
    );
