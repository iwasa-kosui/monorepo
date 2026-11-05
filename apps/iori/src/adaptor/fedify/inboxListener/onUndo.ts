import { type InboxContext } from '@fedify/fedify';
import { Activity, Announce, Follow, Like, Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import { AcceptUnfollowUseCase } from '../../../useCase/acceptUnfollow.ts';
import type { RemoveReceivedEmojiReactUseCase } from '../../../useCase/removeReceivedEmojiReact.ts';
import type { RemoveReceivedLikeUseCase } from '../../../useCase/removeReceivedLike.ts';
import type { RemoveReceivedRepostUseCase } from '../../../useCase/removeReceivedRepost.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

export type OnUndoDeps = Readonly<{
  acceptUnfollowUseCase: ReturnType<typeof AcceptUnfollowUseCase.create>;
  removeReceivedLikeUseCase: RemoveReceivedLikeUseCase;
  removeReceivedRepostUseCase: RemoveReceivedRepostUseCase;
  removeReceivedEmojiReactUseCase: RemoveReceivedEmojiReactUseCase;
}>;

const handleUndoFollow = async (deps: OnUndoDeps, ctx: InboxContext<unknown>, undo: Undo, follow: Follow) => {
  const actorId = undo.actorId;
  if (actorId == null || follow.objectId == null) return;
  const parsed = ctx.parseUri(follow.objectId);
  if (parsed == null || parsed.type !== 'actor') return;

  return RA.flow(
    RA.ok(parsed.identifier),
    RA.andThen(Username.parse),
    RA.andThen(async (username) =>
      deps.acceptUnfollowUseCase.run({
        username,
        follower: {
          uri: actorId.href,
        },
      })
    ),
    RA.match({
      ok: () => {
        getLogger().info(
          `Processed Undo Follow from ${actorId.href} for ${follow.objectId?.href}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Undo Follow from ${actorId.href} for ${follow.objectId?.href} - ${err}`,
        );
      },
    }),
  );
};

const warnUndoActorMismatch = (kind: string, activityUri: string, undoActorUri: string) => {
  getLogger().warn(
    `Ignored Undo ${kind}: ${activityUri} - the Undo sender ${undoActorUri} does not match the stored actor`,
  );
};

const handleUndoLike = async (deps: OnUndoDeps, undo: Undo, like: Like) => {
  if (!like.id) {
    getLogger().warn('Undo Like activity has no Like id');
    return;
  }
  const likeActivityUri = like.id.href;
  const actorId = undo.actorId;
  if (actorId == null) {
    getLogger().warn(`Undo Like activity has no actor: ${likeActivityUri}`);
    return;
  }
  const actorUri = actorId.href;

  const likeResult = await deps.removeReceivedLikeUseCase.run({ likeActivityUri, actorUri });
  if (likeResult.ok) {
    getLogger().info(`Processed Undo Like: ${likeActivityUri}`);
    return;
  }
  if (likeResult.err.type === 'UndoActorMismatchError') {
    warnUndoActorMismatch('Like', likeActivityUri, actorUri);
    return;
  }
  if (likeResult.err.type !== 'LikeNotFoundError') {
    getLogger().warn(`Failed to process Undo Like: ${likeActivityUri} - ${JSON.stringify(likeResult.err)}`);
    return;
  }

  const emojiReactResult = await deps.removeReceivedEmojiReactUseCase.run({
    emojiReactActivityUri: likeActivityUri,
    actorUri,
  });
  if (emojiReactResult.ok) {
    getLogger().info(`Processed Undo Like as EmojiReact: ${likeActivityUri}`);
    return;
  }
  if (emojiReactResult.err.type === 'UndoActorMismatchError') {
    warnUndoActorMismatch('Like', likeActivityUri, actorUri);
    return;
  }
  getLogger().warn(`Failed to process Undo Like: ${likeActivityUri} - ${JSON.stringify(emojiReactResult.err)}`);
};

const handleUndoAnnounce = async (deps: OnUndoDeps, announce: Announce) => {
  if (!announce.id) {
    getLogger().warn('Undo Announce activity has no Announce id');
    return;
  }
  const announceActivityUri = announce.id.href;

  return RA.flow(
    RA.ok({ announceActivityUri }),
    RA.andThen(({ announceActivityUri }) => deps.removeReceivedRepostUseCase.run({ announceActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo Announce: ${announceActivityUri}`);
      },
      err: (err) => {
        getLogger().warn(`Failed to process Undo Announce: ${announceActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );
};

type JsonLdEmojiReact = {
  type: string;
  id?: string;
};

const isEmojiReactJsonLd = (json: unknown): json is JsonLdEmojiReact => {
  if (typeof json !== 'object' || json === null) return false;
  const obj = json as Record<string, unknown>;
  return obj.type === 'EmojiReact' || obj.type === 'litepub:EmojiReact';
};

const handleUndoEmojiReact = async (deps: OnUndoDeps, undo: Undo, object: Activity) => {
  const json = await object.toJsonLd();
  if (!isEmojiReactJsonLd(json)) {
    return false;
  }

  const emojiReactActivityUri = json.id;
  if (!emojiReactActivityUri) {
    getLogger().warn('Undo EmojiReact activity has no EmojiReact id');
    return true;
  }

  const actorId = undo.actorId;
  if (actorId == null) {
    getLogger().warn(`Undo EmojiReact activity has no actor: ${emojiReactActivityUri}`);
    return true;
  }
  const actorUri = actorId.href;

  await RA.flow(
    RA.ok({ emojiReactActivityUri, actorUri }),
    RA.andThen((input) => deps.removeReceivedEmojiReactUseCase.run(input)),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo EmojiReact: ${emojiReactActivityUri}`);
      },
      err: (err) => {
        if (err.type === 'UndoActorMismatchError') {
          warnUndoActorMismatch('EmojiReact', emojiReactActivityUri, actorUri);
          return;
        }
        getLogger().warn(`Failed to process Undo EmojiReact: ${emojiReactActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );

  return true;
};

export const createOnUndo = (deps: OnUndoDeps) => async (ctx: InboxContext<unknown>, undo: Undo) => {
  // 個人inboxの場合はrecipientからidentifierを取得、共有inboxの場合はインスタンスアクターを使用
  // インスタンスアクターを使用することで、Authorized Fetchモードのサーバーにも対応
  const documentLoader = await ctx.getDocumentLoader({
    identifier: ctx.recipient ?? INSTANCE_ACTOR_IDENTIFIER,
  });
  const object = await undo.getObject({ documentLoader });

  if (object instanceof Follow) {
    return handleUndoFollow(deps, ctx, undo, object);
  }

  if (object instanceof Like) {
    return handleUndoLike(deps, undo, object);
  }

  if (object instanceof Announce) {
    return handleUndoAnnounce(deps, object);
  }

  // Try to handle EmojiReact (custom activity type not natively supported by Fedify)
  if (object instanceof Activity) {
    const handled = await handleUndoEmojiReact(deps, undo, object);
    if (handled) {
      return;
    }
  }

  getLogger().info(`Unhandled Undo activity type: ${object?.constructor?.name}`);
};
