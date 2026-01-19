import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact, EmojiReactResolverByActorAndObjectAndEmoji } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { emojiReactsTable } from '../schema.ts';

const resolve = async ({
  actorId,
  objectUri,
  emoji,
}: { actorId: ActorId; objectUri: string; emoji: string }): RA<EmojiReact | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(and(
      eq(emojiReactsTable.actorId, actorId),
      eq(emojiReactsTable.objectUri, objectUri),
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
    objectUri: row.objectUri,
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
    emojiImageUrl: row.emojiImageUrl,
  });
};

const getInstance = singleton(
  (): EmojiReactResolverByActorAndObjectAndEmoji => ({
    resolve,
  }),
);

export const PgEmojiReactResolverByActorAndObjectAndEmoji = {
  getInstance,
} as const;
