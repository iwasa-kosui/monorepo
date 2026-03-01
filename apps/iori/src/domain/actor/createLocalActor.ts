import type { Context } from '@fedify/fedify';

import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { User } from '../user/user.ts';
import { ActorId } from './actorId.ts';
import { ActorEvent } from './aggregate.ts';
import type { LocalActor } from './localActor.ts';

export type LocalActorCreated = ActorEvent<LocalActor, 'actor.created', User>;
export type LocalActorCreatedStore = Agg.Store<LocalActorCreated>;

export const createLocalActor = (
  user: User,
  ctx: Context<unknown>,
  now: Instant,
): LocalActorCreated => {
  const actor = {
    id: ActorId.generate(),
    userId: user.id,
    uri: ctx.getActorUri(user.username).href,
    inboxUrl: ctx.getInboxUri(user.username).href,
    type: 'local' as const,
  };
  return ActorEvent.create(
    actor.id,
    actor,
    'actor.created',
    user,
    now,
  );
};
