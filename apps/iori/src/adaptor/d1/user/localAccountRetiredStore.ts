import { RA } from '@iwasa-kosui/result';
import { eq, inArray, or, sql } from 'drizzle-orm';

import type { LocalAccountRetiredStore } from '../../../domain/user/retireLocalAccount.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { moveMarkersBeforeDismissed } from '../notification/inboxNotificationAdapters.ts';
import { runBatch } from '../runBatch.ts';
import {
  actorsTable,
  aiSummaryUsagesTable,
  aiTranslationUsagesTable,
  blocksTable,
  bookmarksTable,
  digestDeepDiveUsagesTable,
  digestRequestUsagesTable,
  digestSubscriptionsTable,
  digestTopicsTable,
  directPostParticipantsTable,
  domainEventsTable,
  emojiReactsTable,
  federatedTimelineItemsTable,
  followsTable,
  interestSourcesTable,
  keysTable,
  likesTable,
  linkPreviewsTable,
  localActorsTable,
  localLikesTable,
  localPostsTable,
  mastodonMarkersTable,
  mediaUploadsTable,
  mutesTable,
  notificationBlueskyTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationMentionsTable,
  notificationRepliesTable,
  notificationRepostsTable,
  notificationsTable,
  oauthAccessTokensTable,
  oauthAuthorizationCodesTable,
  passkeyCredentialsTable,
  postImagesTable,
  postQuotesTable,
  postsTable,
  postTranslationsTable,
  pushSubscriptionsTable,
  remoteLikesTable,
  remotePostPollVotesTable,
  remotePostRecipientsTable,
  repostsTable,
  sessionsTable,
  timelineItemsTable,
  userPasswordsTable,
  userPreferencesTable,
  usersTable,
  webauthnChallengesTable,
} from '../schema.ts';

/**
 * 退役させるアカウントの通知を選ぶ。そのユーザー宛ての通知と、そのアクターがした行動の、ほかのユーザー宛ての通知。
 * 子のテーブルを消すと親を選べなくなるので、消す前に ID を読んでおく。
 */
const notificationIdsOf = async (db: IoriD1Db, userId: string, actorId: string): Promise<string[]> => {
  const rows = await db.select({ id: notificationsTable.notificationId }).from(notificationsTable).where(or(
    eq(notificationsTable.recipientUserId, userId),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationLikesTable.notificationId }).from(notificationLikesTable)
        .where(eq(notificationLikesTable.likerActorId, actorId)),
    ),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationFollowsTable.notificationId }).from(notificationFollowsTable)
        .where(eq(notificationFollowsTable.followerActorId, actorId)),
    ),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationRepostsTable.notificationId }).from(notificationRepostsTable)
        .where(eq(notificationRepostsTable.reposterActorId, actorId)),
    ),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationEmojiReactsTable.notificationId }).from(notificationEmojiReactsTable)
        .where(eq(notificationEmojiReactsTable.reactorActorId, actorId)),
    ),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationRepliesTable.notificationId }).from(notificationRepliesTable)
        .where(eq(notificationRepliesTable.replierActorId, actorId)),
    ),
    inArray(
      notificationsTable.notificationId,
      db.select({ id: notificationMentionsTable.notificationId }).from(notificationMentionsTable)
        .where(or(
          eq(notificationMentionsTable.mentionerActorId, actorId),
          eq(notificationMentionsTable.recipientUserId, userId),
        )),
    ),
  ));
  return rows.map((row) => row.id);
};

/**
 * ローカルのアカウントを消す。ユーザーとアクターにつながる行を、外部キーの子から親の順に、1 つのバッチで消す。
 * バッチは 1 つのトランザクションなので、途中で失敗したら何も消えない。
 * 記事やダイジェストのように bot が持たないデータは消さない。残っていれば外部キーの制約で失敗し、何も消えない。
 */
export const createD1LocalAccountRetiredStore = (db: IoriD1Db): LocalAccountRetiredStore => ({
  store: async (...events) => {
    for (const event of events) {
      const { userId, actorId } = event.eventPayload;
      const notificationIds = sql`(select value from json_each(${
        idsJson(await notificationIdsOf(db, userId, actorId))
      }))`;
      const ownPostIds = db.select({ id: postsTable.postId }).from(postsTable).where(eq(postsTable.actorId, actorId));
      const ownRepostIds = db.select({ id: repostsTable.repostId }).from(repostsTable)
        .where(eq(repostsTable.actorId, actorId));
      const relatedLikeIds = db.select({ id: likesTable.likeId }).from(likesTable)
        .where(or(eq(likesTable.actorId, actorId), inArray(likesTable.postId, ownPostIds)));
      const recipients = db.select({ id: notificationsTable.recipientUserId }).from(notificationsTable)
        .where(inArray(notificationsTable.notificationId, notificationIds));
      await runBatch(db, [
        ...moveMarkersBeforeDismissed(db, recipients, notificationIds),
        db.delete(notificationLikesTable).where(inArray(notificationLikesTable.notificationId, notificationIds)),
        db.delete(notificationFollowsTable).where(inArray(notificationFollowsTable.notificationId, notificationIds)),
        db.delete(notificationRepostsTable).where(inArray(notificationRepostsTable.notificationId, notificationIds)),
        db.delete(notificationEmojiReactsTable)
          .where(inArray(notificationEmojiReactsTable.notificationId, notificationIds)),
        db.delete(notificationRepliesTable).where(inArray(notificationRepliesTable.notificationId, notificationIds)),
        db.delete(notificationMentionsTable).where(inArray(notificationMentionsTable.notificationId, notificationIds)),
        db.delete(notificationBlueskyTable).where(inArray(notificationBlueskyTable.notificationId, notificationIds)),
        db.delete(notificationsTable).where(inArray(notificationsTable.notificationId, notificationIds)),
        db.delete(timelineItemsTable).where(or(
          eq(timelineItemsTable.actorId, actorId),
          inArray(timelineItemsTable.postId, ownPostIds),
          inArray(timelineItemsTable.repostId, ownRepostIds),
        )),
        db.delete(federatedTimelineItemsTable).where(inArray(federatedTimelineItemsTable.postId, ownPostIds)),
        db.delete(localLikesTable).where(inArray(localLikesTable.likeId, relatedLikeIds)),
        db.delete(remoteLikesTable).where(inArray(remoteLikesTable.likeId, relatedLikeIds)),
        db.delete(likesTable).where(or(eq(likesTable.actorId, actorId), inArray(likesTable.postId, ownPostIds))),
        db.delete(repostsTable).where(or(eq(repostsTable.actorId, actorId), inArray(repostsTable.postId, ownPostIds))),
        db.delete(emojiReactsTable).where(
          or(eq(emojiReactsTable.actorId, actorId), inArray(emojiReactsTable.postId, ownPostIds)),
        ),
        db.delete(bookmarksTable).where(
          or(eq(bookmarksTable.actorId, actorId), inArray(bookmarksTable.postId, ownPostIds)),
        ),
        db.delete(remotePostPollVotesTable).where(
          or(eq(remotePostPollVotesTable.actorId, actorId), inArray(remotePostPollVotesTable.postId, ownPostIds)),
        ),
        db.delete(postImagesTable).where(inArray(postImagesTable.postId, ownPostIds)),
        db.delete(postQuotesTable).where(inArray(postQuotesTable.postId, ownPostIds)),
        db.delete(postTranslationsTable).where(inArray(postTranslationsTable.postId, ownPostIds)),
        db.delete(linkPreviewsTable).where(inArray(linkPreviewsTable.postId, ownPostIds)),
        db.delete(directPostParticipantsTable).where(inArray(directPostParticipantsTable.postId, ownPostIds)),
        db.delete(remotePostRecipientsTable).where(inArray(remotePostRecipientsTable.postId, ownPostIds)),
        db.delete(localPostsTable).where(
          or(eq(localPostsTable.userId, userId), inArray(localPostsTable.postId, ownPostIds)),
        ),
        db.delete(postsTable).where(eq(postsTable.actorId, actorId)),
        db.delete(followsTable).where(or(eq(followsTable.followerId, actorId), eq(followsTable.followingId, actorId))),
        db.delete(mutesTable).where(or(eq(mutesTable.userId, userId), eq(mutesTable.mutedActorId, actorId))),
        db.delete(blocksTable).where(or(eq(blocksTable.userId, userId), eq(blocksTable.blockedActorId, actorId))),
        db.delete(keysTable).where(eq(keysTable.userId, userId)),
        db.delete(sessionsTable).where(eq(sessionsTable.userId, userId)),
        db.delete(userPasswordsTable).where(eq(userPasswordsTable.userId, userId)),
        db.delete(passkeyCredentialsTable).where(eq(passkeyCredentialsTable.userId, userId)),
        db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.userId, userId)),
        db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId)),
        db.delete(mastodonMarkersTable).where(eq(mastodonMarkersTable.userId, userId)),
        db.delete(aiSummaryUsagesTable).where(eq(aiSummaryUsagesTable.userId, userId)),
        db.delete(aiTranslationUsagesTable).where(eq(aiTranslationUsagesTable.userId, userId)),
        db.delete(mediaUploadsTable).where(eq(mediaUploadsTable.userId, userId)),
        db.delete(oauthAccessTokensTable).where(eq(oauthAccessTokensTable.userId, userId)),
        db.delete(oauthAuthorizationCodesTable).where(eq(oauthAuthorizationCodesTable.userId, userId)),
        db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, userId)),
        db.delete(digestSubscriptionsTable).where(eq(digestSubscriptionsTable.userId, userId)),
        db.delete(digestTopicsTable).where(eq(digestTopicsTable.userId, userId)),
        db.delete(digestRequestUsagesTable).where(eq(digestRequestUsagesTable.userId, userId)),
        db.delete(digestDeepDiveUsagesTable).where(eq(digestDeepDiveUsagesTable.userId, userId)),
        db.delete(interestSourcesTable).where(eq(interestSourcesTable.userId, userId)),
        db.delete(localActorsTable).where(eq(localActorsTable.actorId, actorId)),
        db.delete(actorsTable).where(eq(actorsTable.actorId, actorId)),
        db.delete(usersTable).where(eq(usersTable.userId, userId)),
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: event.aggregateId,
          aggregateName: event.aggregateName,
          aggregateState: null,
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        }),
      ]);
    }
    return RA.ok(undefined);
  },
});
