import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, isNull, notExists } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { AiAgentBotPendingTriggersResolver, AiAgentBotTrigger } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  aiAgentBotTriggersTable,
  notificationMentionsTable,
  notificationRepliesTable,
  notificationsTable,
  postsTable,
} from '../schema.ts';

type Row = Readonly<{ postId: string; actorId: string; createdAt: Date }>;

/**
 * bot 宛ての返信とメンションの通知のうち、まだ処理していないものを古い順に返す。
 * 削除された投稿は除く。返信とメンションの両方の通知がある投稿は 1 件にまとめる。
 */
export const createD1AiAgentBotPendingTriggersResolver = (db: IoriD1Db): AiAgentBotPendingTriggersResolver => ({
  resolve: async ({ botUserId, limit }) => {
    if (limit <= 0) return RA.ok([]);
    const unhandled = (postId: typeof postsTable.postId) =>
      notExists(
        db.select({ postId: aiAgentBotTriggersTable.postId }).from(aiAgentBotTriggersTable)
          .where(eq(aiAgentBotTriggersTable.postId, postId)),
      );
    const [replies, mentions] = await Promise.all([
      db.select({
        postId: postsTable.postId,
        actorId: notificationRepliesTable.replierActorId,
        createdAt: notificationsTable.createdAt,
      }).from(notificationRepliesTable)
        .innerJoin(notificationsTable, eq(notificationRepliesTable.notificationId, notificationsTable.notificationId))
        .innerJoin(postsTable, eq(postsTable.postId, notificationRepliesTable.replyPostId))
        .where(
          and(
            eq(notificationsTable.recipientUserId, botUserId),
            isNull(postsTable.deletedAt),
            unhandled(postsTable.postId),
          ),
        )
        .orderBy(asc(notificationsTable.createdAt))
        .limit(limit),
      db.select({
        postId: postsTable.postId,
        actorId: notificationMentionsTable.mentionerActorId,
        createdAt: notificationsTable.createdAt,
      }).from(notificationMentionsTable)
        .innerJoin(notificationsTable, eq(notificationMentionsTable.notificationId, notificationsTable.notificationId))
        .innerJoin(postsTable, eq(postsTable.postId, notificationMentionsTable.mentionPostId))
        .where(
          and(
            eq(notificationsTable.recipientUserId, botUserId),
            isNull(postsTable.deletedAt),
            unhandled(postsTable.postId),
          ),
        )
        .orderBy(asc(notificationsTable.createdAt))
        .limit(limit),
    ]);
    const byPostId = new Map<string, Row>();
    for (const row of [...replies, ...mentions]) {
      const existing = byPostId.get(row.postId);
      if (existing === undefined || row.createdAt < existing.createdAt) byPostId.set(row.postId, row);
    }
    const triggers: AiAgentBotTrigger[] = [...byPostId.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((row) => ({
        postId: PostId.orThrow(row.postId),
        authorActorId: ActorId.orThrow(row.actorId),
        receivedAt: Instant.orThrow(row.createdAt.getTime()),
      }));
    return RA.ok(triggers);
  },
});
