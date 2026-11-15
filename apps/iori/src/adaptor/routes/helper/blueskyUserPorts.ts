import type { Context } from 'hono';

import type { UserId } from '../../../domain/user/userId.ts';
import { getMastodonPrincipal, type MastodonAuthEnv } from '../mastodonAuthn.ts';

/** Bluesky の口はユーザーごとのアカウントで動くので、ログイン中のユーザーを渡して組み立てる */
export type BlueskyPortsForUser<T> = (userId: UserId) => Promise<T>;

/** authn.requireUser を通したハンドラーで、ログイン中のユーザーの ID を読む */
export const userIdOf = (c: Context<MastodonAuthEnv>): UserId => {
  const userId = getMastodonPrincipal(c)?.userId;
  if (userId === undefined || userId === null) throw new Error('The Bluesky route must require a user.');
  return userId;
};
