import { type Collection, CollectionPage, Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import {
  type LocalPostUrisResolverByUris,
  type Post,
  PostNotFoundError,
  type PostResolver,
  type RemotePostUpserter,
  type RemotePostUrisResolverByUris,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import type { FetchReplyNotesRecursiveUseCase } from './fetchReplyNotesRecursive.ts';
import { signalWithTimeout, withFetchTimeout } from './helper/abortableFetch.ts';
import { createRecentRuns } from './helper/recentRuns.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const MAX_REPLY_DEPTH = 3;
const MAX_REPLIES = 40;
const MAX_PAGES = 10;
const MAX_LOOKUPS = 60;
const MAX_ITEMS_PER_PAGE = 100;
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
  remotePostUrisResolverByUris: RemotePostUrisResolverByUris;
  localPostUrisResolverByUris: LocalPostUrisResolverByUris;
  remotePostUpserter: RemotePostUpserter;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase;
  isBlockedUri: (uri: string) => boolean;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => number;
}>;

type Progress = {
  fetched: number;
  replies: number;
  pages: number;
  stopped: boolean;
  signal: AbortSignal;
};

const create = ({
  origin,
  userResolver,
  postResolver,
  remotePostUrisResolverByUris,
  localPostUrisResolverByUris,
  remotePostUpserter,
  blockedActorUriResolverByUsername,
  fetchReplyNotesRecursiveUseCase,
  isBlockedUri,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  now = Date.now,
}: Deps): FetchRemoteContextUseCase => {
  const recentRuns = createRecentRuns<PostId, Awaited<RA<Ok, Err>>>({
    now,
    recentResult: () => RA.ok({ fetchedCount: 0 }),
  });

  const signalFor = (progress: Progress): AbortSignal => signalWithTimeout(progress.signal, fetchTimeoutMs);

  const withPageLimit = (loader: DocumentLoader, progress: Progress): DocumentLoader => (url, options) => {
    if (progress.pages >= MAX_PAGES) {
      return Promise.reject(new Error(`Reached the collection page limit (${MAX_PAGES})`));
    }
    progress.pages++;
    return loader(url, options);
  };

  const storedUris = async (uris: readonly string[]): Promise<ReadonlySet<string>> => {
    const [remote, local] = await Promise.all([
      remotePostUrisResolverByUris.resolve({ uris }),
      localPostUrisResolverByUris.resolve({ uris }),
    ]);
    return new Set([...(remote.ok ? remote.val : []), ...(local.ok ? local.val : [])]);
  };

  const isBlocked = async (username: Username, actorUri: string): Promise<boolean> => {
    const blocked = await blockedActorUriResolverByUsername.resolve({ username, actorUri });
    return blocked.ok && blocked.val;
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
    username: Username,
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
        progress.stopped ? null : ctx.lookupObject(uri, { ...options, signal: signalFor(progress) }),
      shouldSave: async (identity) => !progress.stopped && !(await isBlocked(username, identity.authorIdentity.uri)),
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

    let lookups = 0;

    const lookupNote = async (uri: string): Promise<Note | undefined> => {
      if (progress.stopped || lookups >= MAX_LOOKUPS) {
        return undefined;
      }
      lookups++;
      try {
        const found = await ctx.lookupObject(uri, {
          documentLoader,
          signal: signalFor(progress),
        });
        return found instanceof Note ? found : undefined;
      } catch (error) {
        getLogger().debug(`Failed to look up a note: ${uri} - ${error}`);
        return undefined;
      }
    };

    const visitReply = async (
      replyUri: string,
      parent: Note,
      depth: number,
      isStored: boolean,
    ): Promise<Note | undefined> => {
      try {
        if (isStored && depth + 1 >= MAX_REPLY_DEPTH) {
          return undefined;
        }
        if (isBlockedUri(replyUri)) {
          return undefined;
        }
        const reply = await lookupNote(replyUri);
        if (reply === undefined || reply.replyTargetId?.href !== parent.id?.href) {
          return undefined;
        }
        if (reply.attributionId !== null && await isBlocked(username, reply.attributionId.href)) {
          return undefined;
        }
        if (isStored) {
          return reply;
        }
        const identity = await toRemotePostIdentity(reply, { origin, documentLoader, isBlockedUri });
        if (identity === undefined || await isBlocked(username, identity.authorIdentity.uri) || progress.stopped) {
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
        getLogger().debug(`Failed to visit a reply: ${replyUri} - ${error}`);
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
          const uris = [...new Set(ids.slice(0, MAX_ITEMS_PER_PAGE).map((id) => id.href))]
            .filter((uri) => !visited.has(uri));
          const stored = await storedUris(uris);
          for (const uri of uris) {
            if (progress.stopped || progress.replies >= MAX_REPLIES || lookups >= MAX_LOOKUPS) {
              return;
            }
            visited.add(uri);
            const reply = await visitReply(uri, note, depth, stored.has(uri));
            if (reply !== undefined && depth + 1 < MAX_REPLY_DEPTH) {
              queue.push({ note: reply, depth: depth + 1 });
            }
          }
        }
      } catch (error) {
        getLogger().debug(`Failed to read the replies of a note: ${note.id?.href} - ${error}`);
      }
    }
  };

  const execute = async ({ userId, postId, ctx }: Input): RA<Ok, Err> => {
    const user = await resolveUserWith(userResolver)(userId);
    if (!user.ok) {
      return RA.err(user.err);
    }
    const post = await postResolver.resolve(postId);
    if (!post.ok || post.val === undefined) {
      return RA.err(PostNotFoundError.create(postId));
    }

    const controller = new AbortController();
    const documentLoader = withFetchTimeout(
      await ctx.getDocumentLoader({ identifier: user.val.username }),
      controller.signal,
      fetchTimeoutMs,
    );
    const progress: Progress = { fetched: 0, replies: 0, pages: 0, stopped: false, signal: controller.signal };
    const finished = await withTimeout(
      Promise.all([
        fetchAncestors(post.val, user.val.username, ctx, documentLoader, progress),
        fetchReplies(post.val, user.val.username, ctx, documentLoader, progress),
      ]),
      totalTimeoutMs,
    );
    if (finished === timedOut) {
      progress.stopped = true;
      controller.abort();
      getLogger().debug(`Timed out while fetching the remote context of the post: ${postId}`);
    }
    return RA.ok({ fetchedCount: progress.fetched });
  };

  const run = (input: Input): RA<Ok, Err> => recentRuns(input.postId, () => execute(input));

  return { run };
};

export const FetchRemoteContextUseCase = {
  create,
} as const;
