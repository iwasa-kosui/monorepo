import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReactResolverByActorAndPostAndEmoji } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { emojiReactsTable } from '../schema.ts';

export const createD1EmojiReactResolverByActorAndPostAndEmoji = (
  db: IoriD1Db,
): EmojiReactResolverByActorAndPostAndEmoji => ({
  resolve: async ({ actorId, postId, emoji }) => {
    const [row] = await db.select().from(emojiReactsTable)
      .where(and(
        eq(emojiReactsTable.actorId, actorId),
        eq(emojiReactsTable.postId, postId),
        eq(emojiReactsTable.emoji, emoji),
      ))
      .limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
        actorId: row.actorId as ActorId,
        postId: PostId.orThrow(row.postId),
        emoji: row.emoji,
        emojiReactActivityUri: row.emojiReactActivityUri,
        emojiImageUrl: row.emojiImageUrl,
      },
    );
  },
});
