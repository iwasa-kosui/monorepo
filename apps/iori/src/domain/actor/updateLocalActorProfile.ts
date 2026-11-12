import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { ActorId } from './actorId.ts';
import { ActorEvent } from './aggregate.ts';
import type { LocalActor } from './localActor.ts';
import type { LocalActorProfilePatch } from './localActorProfile.ts';

export type LocalActorProfileUpdated = ActorEvent<
  LocalActor,
  'actor.localProfileUpdated',
  { actorId: ActorId; displayName: string | undefined; bio: string | undefined }
>;
export type LocalActorProfileUpdatedStore = Agg.Store<LocalActorProfileUpdated>;

const apply = (current: string | undefined, next: string | null | undefined): string | undefined =>
  next === undefined ? current : next ?? undefined;

export const updateLocalActorProfile = (now: Instant) =>
(
  actor: LocalActor,
  patch: LocalActorProfilePatch,
): LocalActorProfileUpdated => {
  const displayName = apply(actor.displayName, patch.displayName);
  const bio = apply(actor.bio, patch.bio);
  return ActorEvent.create(
    actor.id,
    { ...actor, displayName, bio },
    'actor.localProfileUpdated',
    { actorId: actor.id, displayName, bio },
    now,
  );
};
