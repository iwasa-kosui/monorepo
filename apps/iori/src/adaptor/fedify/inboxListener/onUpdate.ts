import { type InboxContext } from '@fedify/fedify';
import { type Update } from '@fedify/vocab';
import { getLogger } from '@logtape/logtape';

import { Instant } from '../../../domain/instant/instant.ts';
import {
  buildRemotePostContent,
  isRemotePostObject,
  type RemotePostObject,
} from '../../../useCase/helper/remotePostObject.ts';
import type { UpdateRemotePostUseCase } from '../../../useCase/updateRemotePost.ts';
import { extractContentWarning } from '../extractContentWarning.ts';
import { extractMentionedActorUris } from '../extractMentionedActorUris.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';
import { extractAttachments } from './extractAttachments.ts';

export type OnUpdateDeps = Readonly<{
  origin: string;
  updateRemotePostUseCase: UpdateRemotePostUseCase;
}>;

const toEditedAt = (note: RemotePostObject): Instant => {
  const updated = note.updated;
  if (updated) {
    const parsed = Instant.of(updated.epochMilliseconds);
    if (parsed.ok) return parsed.val;
  }
  return Instant.now();
};

export const createOnUpdate = (deps: OnUpdateDeps) => async (ctx: InboxContext<unknown>, activity: Update) => {
  const logger = getLogger();
  const documentLoader = await ctx.getDocumentLoader({
    identifier: ctx.recipient ?? INSTANCE_ACTOR_IDENTIFIER,
  });

  const object = await activity.getObject({ documentLoader });
  if (!isRemotePostObject(object) || !object.id) {
    return;
  }
  const objectUri = object.id.href;

  const senderId = activity.actorId;
  if (!senderId) {
    logger.warn(`Ignored Update activity that has no actor: ${objectUri}`);
    return;
  }
  if (object.attributionId?.href !== senderId.href) {
    logger.warn(
      `Ignored Update activity whose actor is not the attributedTo of the Note: actor=${senderId.href} attributedTo=${
        object.attributionId?.href ?? 'none'
      } object=${objectUri}`,
    );
    return;
  }
  if (object.id.origin !== senderId.origin) {
    logger.warn(
      `Ignored Update activity whose actor does not match the object origin: actor=${senderId.href} object=${objectUri}`,
    );
    return;
  }

  const attachments = await extractAttachments(object, documentLoader);
  const addressed = object.toIds.length + object.ccIds.length > 0 ? object : activity;
  const actor = await activity.getActor({ documentLoader }).catch(() => null);
  const visibility = actor ? extractVisibility(addressed, actor.followersId) : null;
  const result = await deps.updateRemotePostUseCase.run({
    uri: objectUri,
    actorUri: senderId.href,
    content: await buildRemotePostContent(object),
    ...extractContentWarning(object),
    attachments,
    recipientActorUris: extractRecipientActorUris([object, activity], deps.origin),
    mentionedActorUris: await extractMentionedActorUris(object),
    visibility,
    editedAt: toEditedAt(object),
  });

  if (!result.ok) {
    logger.warn(
      `Ignored Update activity for a post owned by another actor: ${objectUri} actor=${result.err.detail.actorUri}`,
    );
    return;
  }
  switch (result.val.type) {
    case 'updated':
      logger.info(`Processed Update activity: ${objectUri} by ${senderId.href}`);
      return;
    case 'postNotFound':
      logger.info(`No remote post found for Update activity: ${objectUri}`);
      return;
    case 'staleEdit':
      logger.info(`Ignored Update activity that is not newer than the saved edit: ${objectUri}`);
      return;
  }
};
