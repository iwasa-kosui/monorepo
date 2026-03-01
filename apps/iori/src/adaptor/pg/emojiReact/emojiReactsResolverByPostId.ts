import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact, EmojiReactsResolverByPostId } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { emojiReactsTable } from '../schema.ts';

const resolve = async ({ postId }: { postId: PostId }): RA<ReadonlyArray<EmojiReact>, never> => {
  const results = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(eq(emojiReactsTable.postId, postId));

  return RA.ok(results.map(row => ({
    emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
    actorId: row.actorId as ActorId,
    postId: PostId.orThrow(row.postId),
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
    emojiImageUrl: row.emojiImageUrl,
  })));
};

const getInstance = singleton(
  (): EmojiReactsResolverByPostId => ({
    resolve,
  }),
);

export const PgEmojiReactsResolverByPostId = {
  getInstance,
} as const;
