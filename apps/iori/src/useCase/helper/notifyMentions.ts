import { getLogger } from '@logtape/logtape';

import type { PushPayload, WebPushSender } from '../../adaptor/webPush/webPush.ts';
import type { Actor, ActorResolverByUri } from '../../domain/actor/actor.ts';
import type { BlockResolver } from '../../domain/block/block.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import {
  type MentionNotification,
  type MentionNotificationCreatedStore,
  type MentionNotificationResolverByRecipientAndMentionPostId,
  Notification,
} from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../../domain/pushSubscription/pushSubscription.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { isBlockedBy } from './isBlockedBy.ts';

type Deps = Readonly<{
  actorResolverByUri: ActorResolverByUri;
  mentionNotificationCreatedStore: MentionNotificationCreatedStore;
  mentionNotificationResolver: MentionNotificationResolverByRecipientAndMentionPostId;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  blockResolver?: BlockResolver;
}>;

type Params = Readonly<{
  now: Instant;
  mentioner: Actor;
  mentionPostId: PostId;
  recipientActorUris: ReadonlyArray<string>;
  replyRecipientUserId: UserId | undefined;
}>;

export const notifyMentions = ({
  actorResolverByUri,
  mentionNotificationCreatedStore,
  mentionNotificationResolver,
  pushSubscriptionsResolver,
  webPushSender,
  blockResolver,
}: Deps) =>
async ({ now, mentioner, mentionPostId, recipientActorUris, replyRecipientUserId }: Params): Promise<void> => {
  const created: UserId[] = [];
  for (const recipientUri of recipientActorUris) {
    const recipientResult = await actorResolverByUri.resolve(recipientUri);
    const recipient = recipientResult.ok ? recipientResult.val : undefined;
    if (!recipient || recipient.type !== 'local' || recipient.id === mentioner.id) {
      continue;
    }
    if (await isBlockedBy(blockResolver, recipient.userId, mentioner.id)) {
      continue;
    }
    if (recipient.userId === replyRecipientUserId) {
      continue;
    }
    const existing = await mentionNotificationResolver.resolve({
      recipientUserId: recipient.userId,
      mentionPostId,
    });
    if (existing.ok && existing.val) {
      continue;
    }
    const notification: MentionNotification = {
      type: 'mention',
      notificationId: NotificationId.generate(),
      recipientUserId: recipient.userId,
      isRead: false,
      mentionerActorId: mentioner.id,
      mentionPostId,
    };
    try {
      await mentionNotificationCreatedStore.store(Notification.createMentionNotification(notification, now));
    } catch (error) {
      getLogger().warn(`Failed to store a mention notification for ${recipientUri}: ${String(error)}`);
      continue;
    }
    created.push(recipient.userId);
  }

  const mentionerName = mentioner.type === 'remote' && mentioner.username ? mentioner.username : 'Someone';
  const payload: PushPayload = {
    title: 'New Mention',
    body: `${mentionerName} mentioned you`,
    url: '/notifications',
  };
  for (const userId of created) {
    try {
      const subscriptionsResult = await pushSubscriptionsResolver.resolve(userId);
      if (!subscriptionsResult.ok) {
        continue;
      }
      for (const subscription of subscriptionsResult.val) {
        await webPushSender.send(subscription, payload);
      }
    } catch (error) {
      getLogger().warn(`Failed to send a mention Web Push to ${userId}: ${String(error)}`);
    }
  }
};
