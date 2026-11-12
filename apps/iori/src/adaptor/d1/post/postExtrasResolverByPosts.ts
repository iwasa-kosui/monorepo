import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { BlueskyCrosspost } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Post, type PostWithAuthor } from '../../../domain/post/post.ts';
import type { PostExtras, PostExtrasResolverByPosts } from '../../../domain/post/postExtras.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { toBlueskyCrosspost } from '../blueskyCrosspost/blueskyCrosspostRow.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import {
  blueskyCrosspostsTable,
  emojiReactsTable,
  localPostsTable,
  postQuotesTable,
  postsTable,
  remotePostsTable,
} from '../schema.ts';
import { resolvePostsWithAuthorByIds } from './postWithAuthorBatch.ts';

type ReplyTarget = Readonly<{ postId: PostId; actorId: ActorId }>;

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

const addTo = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const group = map.get(key);
  if (group === undefined) map.set(key, [value]);
  else group.push(value);
};

export const createD1PostExtrasResolverByPosts = (db: IoriD1Db, origin: string): PostExtrasResolverByPosts => {
  const originUrl = new URL(origin);
  const uriOf = (post: PostWithAuthor): string =>
    post.type === 'remote' ? post.uri : `${origin}/users/${post.username}/posts/${post.postId}`;
  const localPostIdOf = (uri: string): string | undefined => {
    try {
      const parsed = new URL(uri);
      if (parsed.origin !== originUrl.origin) return undefined;
      return parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/)?.[1];
    } catch {
      return undefined;
    }
  };

  const resolveQuotedPosts = async (
    quoteUris: ReadonlyArray<string>,
    currentActorId: ActorId | undefined,
  ): Promise<ReadonlyMap<string, PostWithAuthor>> => {
    const uris = [...new Set(quoteUris)];
    if (uris.length === 0) return new Map();
    const localIdByUri = new Map(uris.flatMap((uri): [string, string][] => {
      const id = localPostIdOf(uri);
      return id === undefined ? [] : [[uri, id]];
    }));
    const remoteUris = uris.filter((uri) => !localIdByUri.has(uri));
    const [localRows, remoteRows] = await Promise.all([
      localIdByUri.size === 0
        ? Promise.resolve([])
        : db.select({ postId: localPostsTable.postId }).from(localPostsTable)
          .where(inArray(localPostsTable.postId, jsonEach([...localIdByUri.values()]))),
      remoteUris.length === 0
        ? Promise.resolve([])
        : db.select({ uri: remotePostsTable.uri, postId: remotePostsTable.postId }).from(remotePostsTable)
          .where(inArray(remotePostsTable.uri, jsonEach(remoteUris))),
    ]);
    const localPostIds = new Set(localRows.map((row) => row.postId));
    const postIdByUri = new Map<string, string>(remoteRows.map((row) => [row.uri, row.postId]));
    for (const [uri, id] of localIdByUri) {
      if (localPostIds.has(id)) postIdByUri.set(uri, id);
    }
    const posts = await resolvePostsWithAuthorByIds(
      db,
      [...new Set(postIdByUri.values())].map((id) => PostId.orThrow(id)),
      currentActorId,
      true,
    );
    return new Map(
      [...postIdByUri].flatMap(([uri, id]): [string, PostWithAuthor][] => {
        const post = posts.get(PostId.orThrow(id));
        return post !== undefined && (currentActorId !== undefined || Post.isVisibleToAnonymous(post))
          ? [[uri, post]]
          : [];
      }),
    );
  };

  return {
    resolve: async ({ posts, currentActorId }) => {
      if (posts.length === 0) return RA.ok(new Map());
      const postIds = posts.map((post) => post.postId);
      const ownUris = posts.map(uriOf);
      const parentUris = [...new Set(posts.flatMap((post) => post.inReplyToUri === null ? [] : [post.inReplyToUri]))];
      const localParentIds = parentUris.flatMap((uri) => {
        const id = localPostIdOf(uri);
        return id === undefined ? [] : [id];
      });
      const remoteParentUris = parentUris.filter((uri) => localPostIdOf(uri) === undefined);
      const none = Promise.resolve([]);
      const ownLocalPostIds = currentActorId === undefined
        ? []
        : posts.filter((post) => post.type === 'local' && post.actorId === currentActorId).map((post) => post.postId);

      const [localReplies, remoteReplies, localParents, remoteParents, myReactions, crossposts, quoteRows] =
        await Promise.all([
          db.select({ uri: localPostsTable.inReplyToUri, replies: sql<number>`count(*)` })
            .from(localPostsTable)
            .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
            .where(and(isNull(postsTable.deletedAt), inArray(localPostsTable.inReplyToUri, jsonEach(ownUris))))
            .groupBy(localPostsTable.inReplyToUri),
          db.select({ uri: remotePostsTable.inReplyToUri, replies: sql<number>`count(*)` })
            .from(remotePostsTable)
            .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
            .where(and(isNull(postsTable.deletedAt), inArray(remotePostsTable.inReplyToUri, jsonEach(ownUris))))
            .groupBy(remotePostsTable.inReplyToUri),
          localParentIds.length === 0
            ? none
            : db.select({ postId: postsTable.postId, actorId: postsTable.actorId }).from(postsTable)
              .where(and(isNull(postsTable.deletedAt), inArray(postsTable.postId, jsonEach(localParentIds)))),
          remoteParentUris.length === 0
            ? none
            : db.select({ uri: remotePostsTable.uri, postId: postsTable.postId, actorId: postsTable.actorId })
              .from(remotePostsTable)
              .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
              .where(and(isNull(postsTable.deletedAt), inArray(remotePostsTable.uri, jsonEach(remoteParentUris)))),
          currentActorId === undefined
            ? none
            : db.select({ postId: emojiReactsTable.postId, emoji: emojiReactsTable.emoji }).from(emojiReactsTable)
              .where(
                and(eq(emojiReactsTable.actorId, currentActorId), inArray(emojiReactsTable.postId, jsonEach(postIds))),
              ),
          ownLocalPostIds.length === 0
            ? none
            : db.select().from(blueskyCrosspostsTable)
              .where(inArray(blueskyCrosspostsTable.postId, jsonEach(ownLocalPostIds))),
          db.select({ postId: postQuotesTable.postId, quoteUri: postQuotesTable.quoteUri })
            .from(postQuotesTable)
            .where(inArray(postQuotesTable.postId, jsonEach(postIds))),
        ]);
      const quotedByUri = await resolveQuotedPosts(quoteRows.map((row) => row.quoteUri), currentActorId);

      const reactionsByPostId = new Map<string, string[]>();
      for (const reaction of myReactions) {
        addTo(reactionsByPostId, reaction.postId, reaction.emoji);
      }
      const crosspostByPostId = new Map<string, BlueskyCrosspost>();
      for (const row of crossposts) {
        crosspostByPostId.set(row.postId, toBlueskyCrosspost(row));
      }
      const repliesByUri = new Map<string, number>();
      for (const row of [...localReplies, ...remoteReplies]) {
        if (row.uri !== null) repliesByUri.set(row.uri, (repliesByUri.get(row.uri) ?? 0) + Number(row.replies));
      }
      const parentByLocalPostId = new Map<string, ReplyTarget>();
      for (const parent of localParents) {
        parentByLocalPostId.set(parent.postId, {
          postId: PostId.orThrow(parent.postId),
          actorId: ActorId.orThrow(parent.actorId),
        });
      }
      const parentByRemoteUri = new Map<string, ReplyTarget>();
      for (const parent of remoteParents) {
        parentByRemoteUri.set(parent.uri, {
          postId: PostId.orThrow(parent.postId),
          actorId: ActorId.orThrow(parent.actorId),
        });
      }

      const quoteUriByPostId = new Map(quoteRows.map((row) => [row.postId, row.quoteUri]));

      const extras = new Map<PostId, PostExtras>();
      posts.forEach((post, index) => {
        const parentUri = post.inReplyToUri;
        const localParentId = parentUri === null ? undefined : localPostIdOf(parentUri);
        const inReplyTo = parentUri === null
          ? undefined
          : localParentId === undefined
          ? parentByRemoteUri.get(parentUri)
          : parentByLocalPostId.get(localParentId);
        extras.set(post.postId, {
          repliesCount: repliesByUri.get(ownUris[index]!) ?? 0,
          inReplyTo: inReplyTo ?? null,
          myReactionEmojis: reactionsByPostId.get(post.postId) ?? [],
          blueskyCrosspost: crosspostByPostId.get(post.postId) ?? null,
          quote: quoteUriByPostId.has(post.postId)
            ? {
              uri: quoteUriByPostId.get(post.postId)!,
              post: quotedByUri.get(quoteUriByPostId.get(post.postId)!) ?? null,
            }
            : null,
        });
      });
      return RA.ok(extras);
    },
  };
};
