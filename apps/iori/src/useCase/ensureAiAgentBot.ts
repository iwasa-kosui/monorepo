import type { Context } from '@fedify/fedify';
import { PUBLIC_COLLECTION, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActorCreatedStore } from '../domain/actor/createLocalActor.ts';
import { LocalActor } from '../domain/actor/localActor.ts';
import type { LocalActorProfileUpdatedStore } from '../domain/actor/updateLocalActorProfile.ts';
import { updateLocalActorProfile } from '../domain/actor/updateLocalActorProfile.ts';
import { type LogoUriUpdatedStore, updateLogoUri } from '../domain/actor/updateLogoUri.ts';
import { AiAgentBot } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserCreatedStore } from '../domain/user/createUser.ts';
import { User, type UserResolverByUsername } from '../domain/user/user.ts';
import { Username } from '../domain/user/username.ts';
import { buildLocalPerson } from './helper/localPerson.ts';
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
  logoUriUpdatedStore: LogoUriUpdatedStore;
  now: () => Instant;
}>;

/**
 * AI エージェントの bot のユーザーとローカルアクターを用意する。
 * - まだ無ければ作る。パスワードは設定しないので、誰もログインできない
 * - 表示名・自己紹介・アイコンが定めたものと違えば直し、フォロワーに Update を配送する
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

  const ensureProfile = async (
    ctx: Context<unknown>,
    actor: LocalActor,
  ): RA<Readonly<{ actor: LocalActor; changed: boolean }>, never> => {
    const { displayName, bio } = AiAgentBot.profile;
    const logoUri = new URL(AiAgentBot.images.avatarPath, ctx.origin).href;
    const profileChanged = actor.displayName !== displayName || actor.bio !== bio;
    const profiled = profileChanged ? updateLocalActorProfile(deps.now())(actor, { displayName, bio }) : undefined;
    if (profiled !== undefined) await deps.localActorProfileUpdatedStore.store(profiled);
    const afterProfile = profiled?.aggregateState ?? actor;
    const logoUpdated = afterProfile.logoUri === logoUri
      ? undefined
      : updateLogoUri(deps.now())(afterProfile, logoUri);
    if (logoUpdated !== undefined) await deps.logoUriUpdatedStore.store(logoUpdated);
    const updated: LocalActor = logoUpdated === undefined ? afterProfile : { ...afterProfile, logoUri };
    return RA.ok({ actor: updated, changed: profiled !== undefined || logoUpdated !== undefined });
  };

  /** 変えたプロフィールをフォロワーのサーバーに知らせる。作ったばかりのときはフォロワーがいないので送らない */
  const announceProfile = async (ctx: Context<unknown>, actor: LocalActor): Promise<void> => {
    const username = AiAgentBot.username;
    await ctx.sendActivity(
      { identifier: username },
      'followers',
      new Update({
        id: new URL(`#updates/${new Date(deps.now()).toISOString()}`, actor.uri),
        actor: ctx.getActorUri(username),
        object: await buildLocalPerson(ctx, username, actor),
        tos: [PUBLIC_COLLECTION],
        ccs: [ctx.getFollowersUri(username)],
      }),
    );
  };

  return {
    run: async ({ ctx }) => {
      const { user, created } = (await ensureUser(ctx)).val;
      const resolved = await deps.actorResolverByUserId.resolve(user.id);
      if (resolved.val === undefined) {
        throw new Error(`The local actor of the AI agent bot was not found: ${user.id}`);
      }
      const { actor, changed } = (await ensureProfile(ctx, resolved.val)).val;
      if (changed && !created) await announceProfile(ctx, actor);
      return RA.ok({ user, actor, created });
    },
  };
};

export const EnsureAiAgentBotUseCase = { create } as const;
