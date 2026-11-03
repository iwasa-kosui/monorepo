import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostWithAuthor } from '../../../domain/post/post.ts';
import type { PostExtras, PostExtrasResolverByPosts } from '../../../domain/post/postExtras.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { emojiReactsTable, localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

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

      const [localReplies, remoteReplies, localParents, remoteParents, myReactions] = await Promise.all([
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
      ]);

      const reactionsByPostId = new Map<string, string[]>();
      for (const reaction of myReactions) {
        addTo(reactionsByPostId, reaction.postId, reaction.emoji);
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
        });
      });
      return RA.ok(extras);
    },
  };
};
