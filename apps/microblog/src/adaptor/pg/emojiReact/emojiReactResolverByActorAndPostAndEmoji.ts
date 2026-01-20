import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact, EmojiReactResolverByActorAndPostAndEmoji } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { emojiReactsTable } from '../schema.ts';

const resolve = async ({
  actorId,
  postId,
  emoji,
}: { actorId: ActorId; postId: PostId; emoji: string }): RA<EmojiReact | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(and(
      eq(emojiReactsTable.actorId, actorId),
      eq(emojiReactsTable.postId, postId),
      eq(emojiReactsTable.emoji, emoji),
    ))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
    actorId: row.actorId as ActorId,
    postId: PostId.orThrow(row.postId),
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
    emojiImageUrl: row.emojiImageUrl,
  });
};

const getInstance = singleton(
  (): EmojiReactResolverByActorAndPostAndEmoji => ({
    resolve,
  }),
);

export const PgEmojiReactResolverByActorAndPostAndEmoji = {
  getInstance,
} as const;
