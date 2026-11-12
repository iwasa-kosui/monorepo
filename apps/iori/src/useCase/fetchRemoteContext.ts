import { type Collection, CollectionPage, Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import {
  type LocalPostResolverByUri,
  type Post,
  PostNotFoundError,
  type PostResolver,
  type PostResolverByUri,
  type RemotePostUpserter,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import type { FetchReplyNotesRecursiveUseCase } from './fetchReplyNotesRecursive.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const MAX_REPLY_DEPTH = 3;
const MAX_REPLIES = 40;
const MAX_PAGES = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10_000;

type FederationContext = Readonly<{
  getDocumentLoader: (params: { identifier: string }) => Promise<DocumentLoader>;
  lookupObject: (
    uri: string,
    options: { documentLoader: DocumentLoader; signal?: AbortSignal },
  ) => Promise<unknown>;
}>;

type Input = Readonly<{
  userId: UserId;
  postId: PostId;
  ctx: FederationContext;
}>;

type Ok = Readonly<{
  fetchedCount: number;
}>;

type Err = UserNotFoundError | PostNotFoundError;

export type FetchRemoteContextUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  userResolver: UserResolver;
  postResolver: PostResolver;
  postResolverByUri: PostResolverByUri;
  localPostResolverByUri: LocalPostResolverByUri;
  remotePostUpserter: RemotePostUpserter;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

type Progress = {
  fetched: number;
  replies: number;
  pages: number;
  stopped: boolean;
};

const create = ({
  origin,
  userResolver,
  postResolver,
  postResolverByUri,
  localPostResolverByUri,
  remotePostUpserter,
  blockedActorUriResolverByUsername,
  fetchReplyNotesRecursiveUseCase,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: Deps): FetchRemoteContextUseCase => {
  const withFetchTimeout = (loader: DocumentLoader): DocumentLoader => (url, options) =>
    loader(url, {
      ...options,
      signal: options?.signal === undefined
        ? AbortSignal.timeout(fetchTimeoutMs)
        : AbortSignal.any([options.signal, AbortSignal.timeout(fetchTimeoutMs)]),
    });

  const withPageLimit = (loader: DocumentLoader, progress: Progress): DocumentLoader => (url, options) => {
    if (progress.pages >= MAX_PAGES) {
      return Promise.reject(new Error(`Reached the collection page limit (${MAX_PAGES})`));
    }
    progress.pages++;
    return loader(url, options);
  };

  const exists = async (uri: string): Promise<boolean> => {
    const [remote, local] = await Promise.all([
      postResolverByUri.resolve({ uri }),
      localPostResolverByUri.resolve({ uri }),
    ]);
    return (remote.ok && remote.val !== undefined) || (local.ok && local.val !== undefined);
  };

  const replyItemIds = async function*(
    note: Note,
    documentLoader: DocumentLoader,
  ): AsyncGenerator<readonly URL[]> {
    const options = { documentLoader, suppressError: true } as const;
    const seen = new Set<string>();
    let page: Collection | null = await note.getReplies(options);
    while (page !== null) {
      if (page.id !== null) {
        if (seen.has(page.id.href)) return;
        seen.add(page.id.href);
      }
      yield page.itemIds;
      page = page instanceof CollectionPage ? await page.getNext(options) : await page.getFirst(options);
    }
  };

  const fetchAncestors = async (
    post: Post,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    if (post.inReplyToUri === null) {
      return;
    }
    const result = await fetchReplyNotesRecursiveUseCase.run({
      inReplyToUri: post.inReplyToUri,
      documentLoader,
      lookupObject: async (uri, options) =>
        progress.stopped ? null : ctx.lookupObject(uri, { ...options, signal: AbortSignal.timeout(fetchTimeoutMs) }),
    });
    if (result.ok) {
      progress.fetched += result.val.fetchedPosts.length;
    }
  };

  const fetchReplies = async (
    post: Post,
    username: Username,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    if (post.type !== 'remote') {
      return;
    }
    const pageLoader = withPageLimit(documentLoader, progress);
    const visited = new Set<string>([post.uri]);

    const lookupNote = async (uri: string): Promise<Note | undefined> => {
      if (progress.stopped) {
        return undefined;
      }
      try {
        const found = await ctx.lookupObject(uri, {
          documentLoader,
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });
        return found instanceof Note ? found : undefined;
      } catch (error) {
        getLogger().debug(`Failed to look up a note: ${uri} - ${error}`);
        return undefined;
      }
    };

    const isBlocked = async (actorUri: string): Promise<boolean> => {
      const blocked = await blockedActorUriResolverByUsername.resolve({ username, actorUri });
      return blocked.ok && blocked.val;
    };

    const saveReply = async (replyUri: string, parent: Note): Promise<Note | undefined> => {
      try {
        if (visited.has(replyUri) || await exists(replyUri)) {
          return undefined;
        }
        visited.add(replyUri);
        const reply = await lookupNote(replyUri);
        if (reply === undefined || reply.replyTargetId?.href !== parent.id?.href) {
          return undefined;
        }
        if (reply.attributionId !== null && await isBlocked(reply.attributionId.href)) {
          return undefined;
        }
        const identity = await toRemotePostIdentity(reply, { origin, documentLoader });
        if (identity === undefined || await isBlocked(identity.authorIdentity.uri) || progress.stopped) {
          return undefined;
        }
        const upserted = await remotePostUpserter.resolve(identity);
        if (!upserted.ok) {
          return undefined;
        }
        progress.replies++;
        progress.fetched++;
        return reply;
      } catch (error) {
        getLogger().debug(`Failed to save a reply: ${replyUri} - ${error}`);
        return undefined;
      }
    };

    const root = await lookupNote(post.uri);
    if (root === undefined) {
      return;
    }
    const queue: { note: Note; depth: number }[] = [{ note: root, depth: 0 }];
    for (let head = 0; head < queue.length; head++) {
      const { note, depth } = queue[head]!;
      try {
        for await (const ids of replyItemIds(note, pageLoader)) {
          for (const id of ids) {
            if (progress.stopped || progress.replies >= MAX_REPLIES) {
              return;
            }
            const saved = await saveReply(id.href, note);
            if (saved !== undefined && depth + 1 < MAX_REPLY_DEPTH) {
              queue.push({ note: saved, depth: depth + 1 });
            }
          }
        }
      } catch (error) {
        getLogger().debug(`Failed to read the replies of a note: ${note.id?.href} - ${error}`);
      }
    }
  };

  const run = async ({ userId, postId, ctx }: Input): RA<Ok, Err> => {
    const user = await resolveUserWith(userResolver)(userId);
    if (!user.ok) {
      return RA.err(user.err);
    }
    const post = await postResolver.resolve(postId);
    if (!post.ok || post.val === undefined) {
      return RA.err(PostNotFoundError.create(postId));
    }

    const documentLoader = withFetchTimeout(await ctx.getDocumentLoader({ identifier: user.val.username }));
    const progress: Progress = { fetched: 0, replies: 0, pages: 0, stopped: false };
    const finished = await withTimeout(
      Promise.all([
        fetchAncestors(post.val, ctx, documentLoader, progress),
        fetchReplies(post.val, user.val.username, ctx, documentLoader, progress),
      ]),
      totalTimeoutMs,
    );
    if (finished === timedOut) {
      progress.stopped = true;
      getLogger().debug(`Timed out while fetching the remote context of the post: ${postId}`);
    }
    return RA.ok({ fetchedCount: progress.fetched });
  };

  return { run };
};

export const FetchRemoteContextUseCase = {
  create,
} as const;
