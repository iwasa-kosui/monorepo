import type { UserResolverByUsername } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Username } from '../domain/user/username.ts';
import { DAILY_DIGEST_USERNAME } from '../scheduled/digestTasks.ts';

export type IsDigestOwner = (userId: UserId | undefined) => Promise<boolean>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
}>;

const create = ({ userResolverByUsername }: Deps): IsDigestOwner => async (userId) => {
  if (userId === undefined) return false;
  const owner = await userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
  return owner.val !== undefined && owner.val.id === userId;
};

export const IsDigestOwner = { create } as const;
