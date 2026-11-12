import { type RequestContext } from '@fedify/fedify';
import { Create, Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { Post, type PostsResolverByActorId } from '../../domain/post/post.ts';
import { sanitizePostContent } from '../../domain/post/sanitizePostContent.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { toMentionNoteFields } from '../../useCase/helper/mentionNote.ts';
import { toPostAddressing } from '../../useCase/helper/postAddressing.ts';

export type OutboxDispatcherDeps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  postsResolverByActorId: PostsResolverByActorId;
}>;

export const createOutboxDispatcher = (
  { userResolverByUsername, actorResolverByUserId, postsResolverByActorId }: OutboxDispatcherDeps,
) => ({
  dispatch: (ctx: RequestContext<unknown>, identifier: string) =>
    RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen((username) => userResolverByUsername.resolve(username)),
      RA.andThen((user) =>
        user === undefined ? RA.err(new Error(`User not found: ${identifier}`)) : actorResolverByUserId.resolve(user.id)
      ),
      RA.andThen((actor) =>
        actor === undefined
          ? RA.err(new Error(`Actor not found: ${identifier}`))
          : postsResolverByActorId.resolve(actor.id)
      ),
      RA.match({
        ok: (posts) => ({
          items: posts.filter(Post.isVisibleToAnonymous).map((post) => {
            const content = sanitizePostContent(post.content);
            const mentionFields = toMentionNoteFields(content);
            const note = new Note({
              id: ctx.getObjectUri(Note, { identifier, id: post.postId }),
              attribution: ctx.getActorUri(identifier),
              ...toPostAddressing({
                visibility: post.visibility ?? 'public',
                followersUri: ctx.getFollowersUri(identifier),
                mentionUris: mentionFields.ccs,
              }),
              tags: mentionFields.tags,
              content,
              mediaType: 'text/html',
              published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
              url: ctx.getObjectUri(Note, { identifier, id: post.postId }),
              summary: post.summary,
              sensitive: post.sensitive,
            });
            return new Create({
              id: new URL('#activity', note.id ?? undefined),
              object: note,
              actors: note.attributionIds,
              tos: note.toIds,
              ccs: note.ccIds,
            });
          }),
        }),
        err: (error) => {
          getLogger().warn(`Failed to resolve posts for federation: ${identifier} - ${error}`);
          return { items: [] };
        },
      }),
    ),
});
