import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { BlueskyFetchedNotification } from '../../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import type { BlueskyNotificationPage } from '../../ports/blueskyNotificationFetcher.ts';

const SUPPORTED_REASONS = [
  'like',
  'repost',
  'like-via-repost',
  'repost-via-repost',
  'follow',
  'mention',
  'reply',
  'quote',
  'subscribed-post',
] as const;
type SupportedReason = (typeof SUPPORTED_REASONS)[number];

const pageZodType = z.object({ cursor: z.string().optional(), notifications: z.array(z.unknown()) });
const profileZodType = z.looseObject({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
});
const notificationZodType = z.looseObject({
  uri: z.string().min(1),
  cid: z.string().min(1),
  author: profileZodType,
  reason: z.string(),
  reasonSubject: z.string().optional(),
  record: z.looseObject({}),
  isRead: z.boolean(),
  indexedAt: z.string(),
});
const recordTextZodType = z.looseObject({ text: z.unknown() });
const replyRecordZodType = z.looseObject({
  reply: z.looseObject({ parent: z.looseObject({ uri: z.string().min(1) }) }),
});
const viaRepostRecordZodType = z.looseObject({
  subject: z.looseObject({ uri: z.string().min(1) }),
});
const quoteRecordZodType = z.looseObject({
  embed: z.looseObject({ record: z.looseObject({ uri: z.string().min(1) }) }),
});
const quoteWithMediaRecordZodType = z.looseObject({
  embed: z.looseObject({ record: z.looseObject({ record: z.looseObject({ uri: z.string().min(1) }) }) }),
});

const isSupportedReason = (reason: string): reason is SupportedReason =>
  (SUPPORTED_REASONS as readonly string[]).includes(reason);

const toInstant = (value: string): Instant | undefined => {
  const parsed = Instant.of(Date.parse(value));
  return parsed.ok ? parsed.val : undefined;
};

const textOf = (record: unknown): string => {
  const parsed = recordTextZodType.safeParse(record);
  return parsed.success && typeof parsed.data.text === 'string' ? parsed.data.text : '';
};

const quotedUriOf = (record: unknown): string | undefined => {
  const withMedia = quoteWithMediaRecordZodType.safeParse(record);
  if (withMedia.success) return withMedia.data.embed.record.record.uri;
  const quote = quoteRecordZodType.safeParse(record);
  return quote.success ? quote.data.embed.record.uri : undefined;
};

const subjectUriOf = (
  reason: SupportedReason,
  reasonSubject: string | undefined,
  record: unknown,
): string | undefined => {
  const fallback = reasonSubject === '' ? undefined : reasonSubject;
  if (reason === 'reply') {
    const reply = replyRecordZodType.safeParse(record);
    return reply.success ? reply.data.reply.parent.uri : fallback;
  }
  if (reason === 'quote') return quotedUriOf(record) ?? fallback;
  if (reason === 'like-via-repost' || reason === 'repost-via-repost') {
    const viaRepost = viaRepostRecordZodType.safeParse(record);
    return viaRepost.success ? viaRepost.data.subject.uri : undefined;
  }
  return reason === 'mention' || reason === 'subscribed-post' ? undefined : fallback;
};

const itemOf = (raw: unknown): BlueskyFetchedNotification | undefined => {
  const notification = notificationZodType.safeParse(raw);
  if (!notification.success) return undefined;
  const { uri, author, reason, reasonSubject, record, indexedAt: rawIndexedAt } = notification.data;
  const indexedAt = toInstant(rawIndexedAt);
  if (indexedAt === undefined || !isSupportedReason(reason)) return undefined;
  const base = {
    uri,
    reason,
    indexedAt,
    author: {
      did: author.did,
      handle: author.handle,
      displayName: author.displayName === undefined || author.displayName === '' ? null : author.displayName,
      avatarUrl: safeAbsoluteUrl(author.avatar) ?? null,
    },
  };
  const subject = subjectUriOf(reason, reasonSubject, record);
  const parsed = BlueskyFetchedNotification.parse(
    reason === 'mention' || reason === 'reply' || reason === 'quote' || reason === 'subscribed-post'
      ? { ...base, subjectUri: subject ?? null, text: textOf(record) }
      : reason === 'follow'
      ? base
      : { ...base, subjectUri: subject },
  );
  return parsed.ok ? parsed.val : undefined;
};

export const parseBlueskyNotificationResponse = (
  payload: unknown,
): Result<BlueskyNotificationPage, 'invalid_response'> => {
  const page = pageZodType.safeParse(payload);
  if (!page.success) return Result.err('invalid_response');
  const items = page.data.notifications.map(itemOf);
  return Result.ok({
    items: items.filter((item): item is BlueskyFetchedNotification => item !== undefined),
    dropped: items.filter((item) => item === undefined).length,
    cursor: page.data.cursor,
  });
};
