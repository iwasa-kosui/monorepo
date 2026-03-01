import { RA } from '@iwasa-kosui/result';

import { Actor, type ActorResolverByUri } from '../../domain/actor/actor.ts';
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
  actorResolverByUri: ActorResolverByUri;
}>;

export const upsertRemoteActor = (
  { now, remoteActorCreatedStore, logoUriUpdatedStore, actorResolverByUri }: Dependencies,
) => {
  const createRemoteActor = (identity: Identity): RA<Actor, never> =>
    RA.flow(
      RA.ok(RemoteActor.createRemoteActor(identity)),
      RA.andThrough(remoteActorCreatedStore.store),
      RA.map((event) => event.aggregateState),
    );

  const updateLogoUri = (actor: Actor, logoUri: string): RA<Actor, never> =>
    RA.flow(
      RA.ok(Actor.updateLogoUri(now)(actor, logoUri)),
      RA.andThrough(logoUriUpdatedStore.store),
      RA.map(() => ({
        ...actor,
        logoUri,
      })),
    );

  const logoUriChanged = (actor: Actor, identity: Identity): boolean =>
    Boolean(identity.logoUri && actor.logoUri !== identity.logoUri);

  return (identity: Identity): RA<Actor, never> =>
    RA.flow(
      RA.ok({ identity }),
      RA.andBind('existing', ({ identity: { uri } }) => actorResolverByUri.resolve(uri)),
      RA.andThen(({ existing, identity }) => {
        if (!existing) {
          return createRemoteActor(identity);
        }
        if (logoUriChanged(existing, identity)) {
          return updateLogoUri(existing, identity.logoUri!);
        }
        return RA.ok(existing);
      }),
    );
};
