import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { ActorId } from './actorId.ts';
import { ActorEvent } from './aggregate.ts';
import { RemoteActor, type RemoteActorProfile } from './remoteActor.ts';

export type RemoteActorProfileUpdated = ActorEvent<
  RemoteActor,
  'actor.profileUpdated',
  { profile: RemoteActorProfile; actorId: ActorId }
>;
export type RemoteActorProfileUpdatedStore = Agg.Store<RemoteActorProfileUpdated>;

export const updateRemoteActorProfile = (now: Instant) =>
(
  actor: RemoteActor,
  profile: RemoteActorProfile,
): RemoteActorProfileUpdated => {
  return ActorEvent.create(
    actor.id,
    { ...actor, ...RemoteActor.applyProfile(profile) },
    'actor.profileUpdated',
    { profile, actorId: actor.id },
    now,
  );
};
