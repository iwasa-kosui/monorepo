import { RA, type Result } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { Instant } from '../domain/instant/instant.ts';
import { type LocalAccountRetiredStore, retireLocalAccount } from '../domain/user/retireLocalAccount.ts';
import type { UserResolverByUsername } from '../domain/user/user.ts';
import { Username } from '../domain/user/username.ts';
import type { UseCase } from './useCase.ts';

/** アカウントのアクターの Delete を、フォロワーとフォローしている相手へ配送する。runtime が Fedify で用意する */
export type LocalActorDeletionAnnouncer = Readonly<{
  announce: (input: Readonly<{ username: Username; actor: LocalActor }>) => Promise<Result<void, string>>;
}>;

type Input = Readonly<{ usernames: readonly string[] }>;

type Ok = Readonly<{ retired: readonly string[]; failed: readonly string[] }>;

export type RetireLocalAccountsUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  localAccountRetiredStore: LocalAccountRetiredStore;
  deletionAnnouncer: LocalActorDeletionAnnouncer;
  now: () => Instant;
}>;

/**
 * 使わなくなったローカルのアカウントを消す。まだ残っているアカウントだけを扱うので、何度動かしてもよい。
 * 1. アクターの Delete を配送する。配送に失敗したら消さずに、次の実行でやり直す
 * 2. アカウントにつながるデータを消す
 * Delete は、アカウントの鍵で署名して送る。鍵を消す前に送る必要があるので、この順にする。
 */
const create = (deps: Deps): RetireLocalAccountsUseCase => ({
  run: async ({ usernames }) => {
    const retired: string[] = [];
    const failed: string[] = [];
    for (const name of usernames) {
      const username = Username.parse(name);
      if (!username.ok) continue;
      const user = (await deps.userResolverByUsername.resolve(username.val)).val;
      if (user === undefined) continue;
      const actor = (await deps.actorResolverByUserId.resolve(user.id)).val;
      if (actor === undefined) {
        failed.push(name);
        continue;
      }
      const announced = await deps.deletionAnnouncer.announce({ username: username.val, actor });
      if (!announced.ok) {
        failed.push(name);
        continue;
      }
      await deps.localAccountRetiredStore.store(
        retireLocalAccount(deps.now())({ userId: user.id, username: user.username, actorId: actor.id }),
      );
      retired.push(name);
    }
    return RA.ok({ retired, failed });
  },
});

export const RetireLocalAccountsUseCase = { create } as const;
