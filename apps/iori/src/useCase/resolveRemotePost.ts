import { Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import type { LocalPostResolverByUri, PostResolverByUri, RemotePostUpserter } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import type { FederationContext } from './fetchRemoteContext.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10_000;

type Input = Readonly<{
  userId: UserId;
  url: string;
  ctx: FederationContext;
}>;

type Ok = PostId | undefined;

type Err = UserNotFoundError;

export type ResolveRemotePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  userResolver: UserResolver;
  postResolverByUri: PostResolverByUri;
  localPostResolverByUri: LocalPostResolverByUri;
  remotePostUpserter: RemotePostUpserter;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

const create = ({
  origin,
  userResolver,
  postResolverByUri,
  localPostResolverByUri,
  remotePostUpserter,
  blockedActorUriResolverByUsername,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: Deps): ResolveRemotePostUseCase => {
  const ownOrigin = new URL(origin).origin;

  const withFetchTimeout = (loader: DocumentLoader, overall: AbortSignal): DocumentLoader => (url, options) =>
    loader(url, {
      ...options,
      signal: AbortSignal.any(
        options?.signal === undefined
          ? [overall, AbortSignal.timeout(fetchTimeoutMs)]
          : [overall, options.signal, AbortSignal.timeout(fetchTimeoutMs)],
      ),
    });

  const storedPostId = async (uri: string): Promise<PostId | undefined> => {
    const [remote, local] = await Promise.all([
      postResolverByUri.resolve({ uri }),
      localPostResolverByUri.resolve({ uri }),
    ]);
    const post = (remote.ok ? remote.val : undefined) ?? (local.ok ? local.val : undefined);
    return post?.postId;
  };

  const isBlocked = async (username: Username, actorUri: string): Promise<boolean> => {
    const blocked = await blockedActorUriResolverByUsername.resolve({ username, actorUri });
    return blocked.ok && blocked.val;
  };

  const importNote = async (
    url: URL,
    username: Username,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    controller: AbortController,
  ): Promise<PostId | undefined> => {
    const stored = await storedPostId(url.href);
    if (stored !== undefined || url.origin === ownOrigin) {
      return stored;
    }
    const found = await ctx.lookupObject(url.href, {
      documentLoader,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(fetchTimeoutMs)]),
    });
    if (!(found instanceof Note) || found.id === null || found.id.origin === ownOrigin) {
      return undefined;
    }
    const known = await storedPostId(found.id.href);
    if (known !== undefined) {
      return known;
    }
    if (found.attributionId !== null && await isBlocked(username, found.attributionId.href)) {
      return undefined;
    }
    const identity = await toRemotePostIdentity(found, { origin, documentLoader });
    if (identity === undefined || await isBlocked(username, identity.authorIdentity.uri) || controller.signal.aborted) {
      return undefined;
    }
    const upserted = await remotePostUpserter.resolve(identity);
    return upserted.ok ? upserted.val.postId : undefined;
  };

  const run = async ({ userId, url, ctx }: Input): RA<Ok, Err> => {
    const user = await resolveUserWith(userResolver)(userId);
    if (!user.ok) {
      return RA.err(user.err);
    }
    if (!URL.canParse(url)) {
      return RA.ok(undefined);
    }
    const controller = new AbortController();
    try {
      const documentLoader = withFetchTimeout(
        await ctx.getDocumentLoader({ identifier: user.val.username }),
        controller.signal,
      );
      const finished = await withTimeout(
        importNote(new URL(url), user.val.username, ctx, documentLoader, controller),
        totalTimeoutMs,
      );
      if (finished === timedOut) {
        controller.abort();
        getLogger().debug(`Timed out while resolving the remote post: ${url}`);
        return RA.ok(undefined);
      }
      return RA.ok(finished);
    } catch (error) {
      controller.abort();
      getLogger().debug(`Failed to resolve the remote post: ${url} - ${error}`);
      return RA.ok(undefined);
    }
  };

  return { run };
};

export const ResolveRemotePostUseCase = {
  create,
} as const;
