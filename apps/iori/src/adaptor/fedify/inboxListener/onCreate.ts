import { Create, type InboxContext, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import type { FetchReplyNotesRecursiveUseCase } from '../../../useCase/fetchReplyNotesRecursive.ts';
import { extractVisibility } from '../extractVisibility.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';
import { extractAttachments } from './extractAttachments.ts';

export type OnCreateDeps = Readonly<{
  inboxActorResolver: InboxActorResolver;
  addRemotePostUseCase: AddRemotePostUseCase;
  fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase;
}>;

export const createOnCreate = (deps: OnCreateDeps) => async (ctx: InboxContext<unknown>, activity: Create) => {
  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actor, actorIdentity, documentLoaderOptions } = actorResult.val;
  const documentLoader = documentLoaderOptions.documentLoader;
  if (!documentLoader) {
    getLogger().warn('documentLoader is undefined');
    return;
  }

  const object = await activity.getObject({ documentLoader });
  if (!(object instanceof Note)) {
    return;
  }
  if (!object.id) {
    return;
  }
  const objectUri = object.id.href;

  const attachments = await extractAttachments(object, documentLoader);
  const inReplyToUri = object.replyTargetId?.href ?? null;
  const addressed = object.toIds.length + object.ccIds.length > 0 ? object : activity;
  const visibility = extractVisibility(addressed, actor.followersId);

  return RA.flow(
    deps.addRemotePostUseCase.run({
      content: String(object.content),
      uri: objectUri,
      actorIdentity,
      attachments,
      inReplyToUri,
      visibility,
    }),
    RA.match({
      ok: async ({ actor: createdActor }) => {
        getLogger().info(
          `Processed Create activity: ${objectUri} by ${createdActor.uri}`,
        );

        if (inReplyToUri) {
          const result = await deps.fetchReplyNotesRecursiveUseCase.run({
            inReplyToUri,
            documentLoader,
            lookupObject: (uri, options) => ctx.lookupObject(uri, options),
          });
          if (result.ok && result.val.fetchedPosts.length > 0) {
            getLogger().info(
              `Fetched ${result.val.fetchedPosts.length} reply notes for: ${objectUri}`,
            );
          }
        }
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Create activity: ${objectUri} - ${err}`,
        );
      },
    }),
  );
};
