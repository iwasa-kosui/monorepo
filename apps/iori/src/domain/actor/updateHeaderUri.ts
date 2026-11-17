import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { ActorId } from './actorId.ts';
import { ActorEvent } from './aggregate.ts';
import type { LocalActor } from './localActor.ts';

export type HeaderUriUpdated = ActorEvent<
  LocalActor,
  'actor.headerUriUpdated',
  { actorId: ActorId; headerUri: string | undefined }
>;
export type HeaderUriUpdatedStore = Agg.Store<HeaderUriUpdated>;

/** ヘッダー画像を差し替える。headerUri が undefined のときは未設定に戻す */
export const updateHeaderUri = (now: Instant) =>
(
  actor: LocalActor,
  headerUri: string | undefined,
): HeaderUriUpdated =>
  ActorEvent.create(
    actor.id,
    { ...actor, headerUri },
    'actor.headerUriUpdated',
    { actorId: actor.id, headerUri },
    now,
  );
