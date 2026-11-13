import { RA, Result } from '@iwasa-kosui/result';

import { graphemesOf } from '../adaptor/bluesky/blueskyPostRecord.ts';
import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPush.ts';
import {
  BLUESKY_CHAT_PAGE_LIMIT,
  type BlueskyChatConvo,
  type BlueskyChatTextMessage,
} from '../domain/blueskyChat/blueskyChat.ts';
import {
  BLUESKY_CHAT_PUSH_BODY_MAX_GRAPHEMES,
  type BlueskyChatPushReceiptsResolverByConvoIds,
  type BlueskyChatPushReceiptsSavedStore,
} from '../domain/blueskyChatPush/blueskyChatPush.ts';
import type { BlueskyStoredCredentialResolver } from '../domain/blueskyCredential/blueskyCredential.ts';
import {
  BLUESKY_NOTIFICATION_PUSH_FRESH_WINDOW_MS,
  BLUESKY_NOTIFICATION_PUSH_MAX_PER_RUN,
} from '../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../domain/instant/instant.ts';
import type {
  PushSubscription,
  PushSubscriptionsResolverByUserId,
} from '../domain/pushSubscription/pushSubscription.ts';
import type { UserResolverByUsername } from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import type { BlueskyChat } from '../ports/blueskyChat.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

const MESSAGES_URL = '/messages';
const EMPTY_BODY = '新しいメッセージがあります';

type Input = void;

type Skipped = 'noOwner' | 'noSubscriptions' | 'chatNotPermitted';

type Ok = Readonly<{ skipped: Skipped | null; fetched: number; notified: number; pushed: number }>;

type Err = BlueskyClientError;

export type CollectBlueskyChatPushUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  chat: Pick<BlueskyChat, 'viewerDid' | 'listConvos'>;
  ownerUsername: Username;
  userResolverByUsername: UserResolverByUsername;
  storedCredentialResolver: BlueskyStoredCredentialResolver;
  receiptsResolver: BlueskyChatPushReceiptsResolverByConvoIds;
  receiptsSavedStore: BlueskyChatPushReceiptsSavedStore;
  pushSubscriptionsResolverByUserId: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  now: () => Instant;
}>;

type Candidate = Readonly<{
  convoId: string;
  messageId: string;
  sentAt: number;
  payload: PushPayload;
}>;

const skipped = (reason: Skipped): Ok => ({ skipped: reason, fetched: 0, notified: 0, pushed: 0 });

const bodyOf = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === '') return EMPTY_BODY;
  const graphemes = graphemesOf(trimmed);
  return graphemes.length > BLUESKY_CHAT_PUSH_BODY_MAX_GRAPHEMES
    ? `${graphemes.slice(0, BLUESKY_CHAT_PUSH_BODY_MAX_GRAPHEMES).join('')}…`
    : trimmed;
};

const payloadOf = (convo: BlueskyChatConvo, message: BlueskyChatTextMessage): PushPayload => {
  const sender = convo.members.find((member) => member.did === message.senderDid);
  const name = sender === undefined ? message.senderDid : sender.displayName ?? sender.handle;
  return {
    title: convo.status === 'request' ? `${name} からのメッセージリクエスト` : `${name} からのメッセージ`,
    body: bodyOf(message.text),
    url: `${MESSAGES_URL}/${encodeURIComponent(convo.id)}`,
  };
};

const candidateOf = (convo: BlueskyChatConvo, viewerDid: string, freshStart: number): Candidate | undefined => {
  const message = convo.lastMessage;
  if (convo.muted || message?.kind !== 'message') return undefined;
  if (convo.status !== 'accepted' && convo.status !== 'request') return undefined;
  if (convo.status === 'accepted' && convo.unreadCount === 0) return undefined;
  if (message.senderDid === viewerDid || message.sentAt < freshStart) return undefined;
  return { convoId: convo.id, messageId: message.id, sentAt: message.sentAt, payload: payloadOf(convo, message) };
};

const create = (
  {
    chat,
    ownerUsername,
    userResolverByUsername,
    storedCredentialResolver,
    receiptsResolver,
    receiptsSavedStore,
    pushSubscriptionsResolverByUserId,
    webPushSender,
    now,
  }: Deps,
): CollectBlueskyChatPushUseCase => {
  const push = async (
    subscriptions: readonly PushSubscription[],
    candidates: readonly Candidate[],
  ): Promise<number> => {
    const individual = candidates.slice(0, BLUESKY_NOTIFICATION_PUSH_MAX_PER_RUN);
    const rest = candidates.length - individual.length;
    const payloads = [
      ...individual.map((candidate) => candidate.payload),
      ...(rest > 0
        ? [{
          title: 'Bluesky のメッセージ',
          body: `ほか ${rest} 件の会話に新しいメッセージがあります`,
          url: MESSAGES_URL,
        }]
        : []),
    ];
    let pushed = 0;
    for (const payload of payloads) {
      for (const subscription of subscriptions) {
        try {
          const sent = await webPushSender.send(subscription, payload);
          if (sent.ok) {
            pushed += 1;
          } else {
            console.error('iori bluesky chat push: sending a web push failed.', {
              subscriptionId: subscription.subscriptionId,
              errorMessage: sent.err.message,
              statusCode: sent.err.statusCode,
            });
          }
        } catch (error) {
          console.error('iori bluesky chat push: sending a web push threw.', {
            subscriptionId: subscription.subscriptionId,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return pushed;
  };

  const run = async (): RA<Ok, Err> => {
    const startedAt = now();
    const owner = Result.unsafeUnwrap(await userResolverByUsername.resolve(ownerUsername));
    if (owner === undefined) return RA.ok(skipped('noOwner'));
    const subscriptions = Result.unsafeUnwrap(await pushSubscriptionsResolverByUserId.resolve(owner.id));
    if (subscriptions.length === 0) return RA.ok(skipped('noSubscriptions'));
    const stored = Result.unsafeUnwrap(await storedCredentialResolver.resolve());
    if (stored?.chatPermitted === false) return RA.ok(skipped('chatNotPermitted'));

    const page = await chat.listConvos({ limit: BLUESKY_CHAT_PAGE_LIMIT, readState: 'unread' });
    if (!page.ok) return page.err.kind === 'chat_not_permitted' ? RA.ok(skipped('chatNotPermitted')) : RA.err(page.err);
    const viewerDid = await chat.viewerDid();
    if (!viewerDid.ok) return RA.err(viewerDid.err);

    const freshStart = Instant.addDuration(startedAt, -BLUESKY_NOTIFICATION_PUSH_FRESH_WINDOW_MS);
    const candidates = page.val.items
      .flatMap((convo) => candidateOf(convo, viewerDid.val, freshStart) ?? [])
      .sort((a, b) => b.sentAt - a.sentAt);
    const notified = Result.unsafeUnwrap(
      await receiptsResolver.resolve(candidates.map((candidate) => candidate.convoId)),
    );
    const pending = candidates.filter((candidate) => notified.get(candidate.convoId) !== candidate.messageId);
    const fetched = page.val.items.length;
    if (pending.length === 0) return RA.ok({ skipped: null, fetched, notified: 0, pushed: 0 });

    Result.unsafeUnwrap(
      await receiptsSavedStore.store(
        ...pending.map((candidate) => ({
          convoId: candidate.convoId,
          lastMessageId: candidate.messageId,
          notifiedAt: startedAt,
        })),
      ),
    );
    const pushed = await push(subscriptions, pending);
    return RA.ok({ skipped: null, fetched, notified: pending.length, pushed });
  };

  return { run };
};

export const CollectBlueskyChatPushUseCase = {
  create,
} as const;
