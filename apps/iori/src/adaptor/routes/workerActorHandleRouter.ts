import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';

import type { ActorIdResolverByAcct } from '../../domain/actor/accountRelationship.ts';
import { parseAcct } from '../../domain/actor/acct.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { blueskyProfilePathOf, blueskyProfileUrlOfActor } from '../../helper/blueskyUrl.ts';
import { timedOut, withTimeout } from '../../helper/withTimeout.ts';
import type { ResolveRemoteAccountUseCase } from '../../useCase/resolveRemoteAccount.ts';

type Dependencies = Readonly<{
  actorIdResolverByAcct: ActorIdResolverByAcct;
  resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase;
  /** リクエストのセッションからログイン中のユーザーを求める。ログインしていなければ undefined */
  viewerUserIdOf: (request: Request) => Promise<UserId | undefined>;
}>;

const REMOTE_LOOKUP_TIMEOUT_MS = 10_000;
// 外部へ問い合わせる前に、ユーザー名とホスト名として読める形だけを通す
const remoteUsernamePattern = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/;
const remoteHostPattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/**
 * ハンドルを書いた URL を、そのアクターのプロフィールページへ転送する。
 *
 * - `/@alice.bsky.social`、`/@did:plc:...`（`@` が1つ）: Bluesky のプロフィール
 * - `/@alice@自サーバーのホスト`: ローカルのアクター
 * - `/@alice@remote.example`: リモートのアクター。このサーバーがまだ知らないアクターは、
 *   ログイン中ならその場で取り込む。ログインしていなければログイン画面へ送る
 */
export const createWorkerActorHandleRouter = (
  { actorIdResolverByAcct, resolveRemoteAccountUseCase, viewerUserIdOf }: Dependencies,
): Hono => {
  const fetchRemoteActorId = async (
    request: Request,
    userId: UserId,
    handle: string,
  ): Promise<ActorId | undefined> => {
    try {
      const resolved = await withTimeout(
        resolveRemoteAccountUseCase.run({ userId, handle, request }),
        REMOTE_LOOKUP_TIMEOUT_MS,
      );
      return resolved === timedOut || !resolved.ok ? undefined : resolved.val;
    } catch (error) {
      getLogger().warn(`Failed to resolve a remote actor for a handle URL: ${String(error)}`);
      return undefined;
    }
  };

  const app = new Hono();
  app.on('GET', ['/:handle{@[^/]+}', '/:handle{@[^/]+}/'], async (c) => {
    const url = new URL(c.req.url);
    const acct = c.req.param('handle').slice(1);
    if (!acct.includes('@')) {
      return blueskyProfileUrlOfActor(acct) === undefined
        ? c.notFound()
        : c.redirect(`${blueskyProfilePathOf(acct)}${url.search}`);
    }
    const lookup = parseAcct(acct, url.host);
    if (lookup === undefined) return c.notFound();
    const known = await actorIdResolverByAcct.resolve(lookup);
    if (!known.ok) return c.notFound();
    if (lookup.type === 'local') {
      return known.val === undefined
        ? c.notFound()
        : c.redirect(`/users/${encodeURIComponent(lookup.username)}${url.search}`);
    }
    if (known.val !== undefined) return c.redirect(`/remote-users/${known.val}${url.search}`);
    if (!remoteUsernamePattern.test(lookup.username) || !remoteHostPattern.test(lookup.host)) return c.notFound();
    const userId = await viewerUserIdOf(c.req.raw);
    if (userId === undefined) return c.redirect('/sign-in');
    const actorId = await fetchRemoteActorId(c.req.raw, userId, `${lookup.username}@${lookup.host}`);
    return actorId === undefined ? c.notFound() : c.redirect(`/remote-users/${actorId}${url.search}`);
  });
  return app;
};
