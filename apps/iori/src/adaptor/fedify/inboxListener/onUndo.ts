import { Activity, Announce, Follow, type InboxContext, Like, Undo } from '@fedify/fedify';
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

const handleUndoLike = async (deps: OnUndoDeps, like: Like) => {
  if (!like.id) {
    getLogger().warn('Undo Like activity has no Like id');
    return;
  }
  const likeActivityUri = like.id.href;

  return RA.flow(
    RA.ok({ likeActivityUri }),
    RA.andThen(({ likeActivityUri }) => deps.removeReceivedLikeUseCase.run({ likeActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo Like: ${likeActivityUri}`);
      },
      err: (err) => {
        getLogger().warn(`Failed to process Undo Like: ${likeActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );
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

const handleUndoEmojiReact = async (deps: OnUndoDeps, object: Activity) => {
  const json = await object.toJsonLd();
  if (!isEmojiReactJsonLd(json)) {
    return false;
  }

  const emojiReactActivityUri = json.id;
  if (!emojiReactActivityUri) {
    getLogger().warn('Undo EmojiReact activity has no EmojiReact id');
    return true;
  }

  await RA.flow(
    RA.ok({ emojiReactActivityUri }),
    RA.andThen(({ emojiReactActivityUri }) => deps.removeReceivedEmojiReactUseCase.run({ emojiReactActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo EmojiReact: ${emojiReactActivityUri}`);
      },
      err: (err) => {
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
    return handleUndoLike(deps, object);
  }

  if (object instanceof Announce) {
    return handleUndoAnnounce(deps, object);
  }

  // Try to handle EmojiReact (custom activity type not natively supported by Fedify)
  if (object instanceof Activity) {
    const handled = await handleUndoEmojiReact(deps, object);
    if (handled) {
      return;
    }
  }

  getLogger().info(`Unhandled Undo activity type: ${object?.constructor?.name}`);
};
