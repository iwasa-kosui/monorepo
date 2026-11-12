import { type InboxContext } from '@fedify/fedify';
import type { Block } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import type { AcceptBlockUseCase } from '../../../useCase/acceptBlock.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

export type OnBlockDeps = Readonly<{
  acceptBlockUseCase: AcceptBlockUseCase;
}>;

export const createOnBlock = (deps: OnBlockDeps) => async (ctx: InboxContext<unknown>, activity: Block) => {
  const blockerUri = activity.actorId;
  if (blockerUri == null || activity.objectId == null) {
    return;
  }
  const object = ctx.parseUri(activity.objectId);
  if (object == null || object.type !== 'actor' || object.identifier === INSTANCE_ACTOR_IDENTIFIER) {
    return;
  }
  return RA.flow(
    RA.ok(object.identifier),
    RA.andThen(Username.parse),
    RA.andThen((username) => deps.acceptBlockUseCase.run({ username, blocker: { uri: blockerUri.href } })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Block activity from ${blockerUri.href} for ${activity.objectId?.href}`);
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Block activity from ${blockerUri.href} for ${activity.objectId?.href} - ${err}`,
        );
      },
    }),
  );
};
