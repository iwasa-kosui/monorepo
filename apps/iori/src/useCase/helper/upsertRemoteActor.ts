import { RA } from '@iwasa-kosui/result';

import { Actor, type ActorResolverByUri } from '../../domain/actor/actor.ts';
import { RemoteActor, type RemoteActorCreatedStore, type RemoteActorProfile } from '../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../domain/actor/updateLogoUri.ts';
import type { RemoteActorProfileUpdatedStore } from '../../domain/actor/updateProfile.ts';
import type { Instant } from '../../domain/instant/instant.ts';

type Identity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
  profile?: RemoteActorProfile;
}>;

type Dependencies = Readonly<{
  now: Instant;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  remoteActorProfileUpdatedStore?: RemoteActorProfileUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

export const upsertRemoteActor = (
  { now, remoteActorCreatedStore, logoUriUpdatedStore, remoteActorProfileUpdatedStore, actorResolverByUri }:
    Dependencies,
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

  const updateProfileIfChanged = (actor: Actor, identity: Identity): RA<Actor, never> => {
    const { profile } = identity;
    if (!remoteActorProfileUpdatedStore || !profile || actor.type !== 'remote') {
      return RA.ok(actor);
    }
    if (!RemoteActor.isProfileChanged(actor, profile)) {
      return RA.ok(actor);
    }
    return RA.flow(
      RA.ok(Actor.updateRemoteActorProfile(now)(actor, profile)),
      RA.andThrough(remoteActorProfileUpdatedStore.store),
      RA.map((event) => event.aggregateState),
    );
  };

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
        return RA.flow(
          logoUriChanged(existing, identity)
            ? updateLogoUri(existing, identity.logoUri!)
            : RA.ok(existing),
          RA.andThen((actor) => updateProfileIfChanged(actor, identity)),
        );
      }),
    );
};
