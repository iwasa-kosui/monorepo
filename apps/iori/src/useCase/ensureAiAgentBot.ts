import type { Context } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActorCreatedStore } from '../domain/actor/createLocalActor.ts';
import { LocalActor } from '../domain/actor/localActor.ts';
import type { LocalActorProfileUpdatedStore } from '../domain/actor/updateLocalActorProfile.ts';
import { updateLocalActorProfile } from '../domain/actor/updateLocalActorProfile.ts';
import { AiAgentBot } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserCreatedStore } from '../domain/user/createUser.ts';
import { User, type UserResolverByUsername } from '../domain/user/user.ts';
import { Username } from '../domain/user/username.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ ctx: Context<unknown> }>;

type Ok = Readonly<{ user: User; actor: LocalActor; created: boolean }>;

export type EnsureAiAgentBotUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  userCreatedStore: UserCreatedStore;
  localActorCreatedStore: LocalActorCreatedStore;
  actorResolverByUserId: ActorResolverByUserId;
  localActorProfileUpdatedStore: LocalActorProfileUpdatedStore;
  now: () => Instant;
}>;

/**
 * AI エージェントの bot のユーザーとローカルアクターを用意する。
 * - まだ無ければ作る。パスワードは設定しないので、誰もログインできない
 * - 表示名と自己紹介が定めたものと違えば直す
 * 利用者の新規登録（signUp）とは別の経路なので、ユーザー名の許可の確認は通さない。
 */
const create = (deps: Deps): EnsureAiAgentBotUseCase => {
  const username = Username.orThrow(AiAgentBot.username);

  const ensureUser = async (ctx: Context<unknown>): RA<Readonly<{ user: User; created: boolean }>, never> => {
    const existing = await deps.userResolverByUsername.resolve(username);
    if (existing.val !== undefined) return RA.ok({ user: existing.val, created: false });
    const now = deps.now();
    const userCreated = User.createUser(now)({ username });
    await deps.userCreatedStore.store(userCreated);
    const user = userCreated.aggregateState;
    await deps.localActorCreatedStore.store(LocalActor.createLocalActor(user, ctx, now));
    return RA.ok({ user, created: true });
  };

  const ensureProfile = async (user: User): RA<LocalActor | undefined, never> => {
    const actor = await deps.actorResolverByUserId.resolve(user.id);
    if (actor.val === undefined) return RA.ok(undefined);
    const { displayName, bio } = AiAgentBot.profile;
    if (actor.val.displayName === displayName && actor.val.bio === bio) return RA.ok(actor.val);
    const updated = updateLocalActorProfile(deps.now())(actor.val, { displayName, bio });
    await deps.localActorProfileUpdatedStore.store(updated);
    return RA.ok(updated.aggregateState);
  };

  return {
    run: async ({ ctx }) => {
      const { user, created } = (await ensureUser(ctx)).val;
      const actor = (await ensureProfile(user)).val;
      if (actor === undefined) throw new Error(`The local actor of the AI agent bot was not found: ${user.id}`);
      return RA.ok({ user, actor, created });
    },
  };
};

export const EnsureAiAgentBotUseCase = { create } as const;
