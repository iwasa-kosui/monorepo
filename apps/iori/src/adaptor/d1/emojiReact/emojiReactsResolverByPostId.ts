import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReactsResolverByPostId } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { emojiReactsTable } from '../schema.ts';

export const createD1EmojiReactsResolverByPostId = (db: IoriD1Db): EmojiReactsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok(
      (await db.select().from(emojiReactsTable).where(eq(emojiReactsTable.postId, postId))).map((row) => ({
        emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
        actorId: row.actorId as ActorId,
        postId: PostId.orThrow(row.postId),
        emoji: row.emoji,
        emojiReactActivityUri: row.emojiReactActivityUri,
        emojiImageUrl: row.emojiImageUrl,
      })),
    ),
});
