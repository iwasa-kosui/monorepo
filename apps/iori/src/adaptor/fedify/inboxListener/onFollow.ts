import { Accept, type Follow, type InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import { AcceptFollowRequestUseCase } from '../../../useCase/acceptFollowRequest.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';

export type OnFollowDeps = Readonly<{
  inboxActorResolver: InboxActorResolver;
  acceptFollowRequestUseCase: ReturnType<typeof AcceptFollowRequestUseCase.create>;
}>;

export const createOnFollow = (deps: OnFollowDeps) => async (ctx: InboxContext<unknown>, activity: Follow) => {
  if (!activity.objectId) {
    return;
  }
  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actor: follower, actorIdentity: followerIdentity } = actorResult.val;
  return RA.flow(
    RA.ok({}),
    RA.andBind('object', () => {
      const object = ctx.parseUri(activity.objectId);
      if (!object) {
        return RA.err(new Error('Invalid object URI'));
      }
      if (object.type !== 'actor') {
        return RA.err(new Error('Object is not an actor'));
      }
      return RA.ok(object);
    }),
    RA.andBind('username', ({ object }) => Username.parse(object.identifier)),
    RA.andThrough(async ({ username, object }) => {
      await deps.acceptFollowRequestUseCase.run({
        username,
        follower: followerIdentity,
      });
      await ctx.sendActivity(
        object,
        follower,
        new Accept({
          actor: activity.objectId,
          to: activity.actorId,
          object: activity,
        }),
      );
      return RA.ok(undefined);
    }),
    RA.match({
      ok: () => {
        getLogger().info(
          `Processed Follow activity from ${activity.actorId?.href} for ${activity.objectId?.href}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Follow activity from ${activity.actorId?.href} for ${activity.objectId?.href} - ${err}`,
        );
      },
    }),
  );
};
