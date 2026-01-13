import type { Agg } from "../aggregate/index.ts";
import type { Instant } from "../instant/instant.ts";
import type { ActorId } from "./actorId.ts";
import { ActorEvent } from "./aggregate.ts";
import type { LocalActor } from "./localActor.ts";
import type { RemoteActor } from "./remoteActor.ts";

export type LogoUriUpdated = ActorEvent<LocalActor | RemoteActor, 'actor.logoUriUpdated', { logoUri: string, actorId: ActorId }>;
export type LogoUriUpdatedStore = Agg.Store<LogoUriUpdated>;

export const updateLogoUri = (now: Instant) => (
  actor: LocalActor | RemoteActor,
  logoUri: string
): LogoUriUpdated => {
  return ActorEvent.create(
    actor.id,
    { ...actor, logoUri },
    'actor.logoUriUpdated',
    { logoUri, actorId: actor.id },
    now
  )
}
