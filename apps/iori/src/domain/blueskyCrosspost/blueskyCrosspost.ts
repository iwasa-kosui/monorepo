import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { mentionLinksOfHtml } from '../post/mention.ts';
import { PostId } from '../post/postId.ts';
import type { Visibility } from '../post/visibility.ts';
import { UserId } from '../user/userId.ts';

export const BlueskyCrosspostStatus = z.enum(['pending', 'sent', 'failed', 'skipped', 'deleting']);
export type BlueskyCrosspostStatus = z.infer<typeof BlueskyCrosspostStatus>;

// content_warning と sensitive は、送らなかった過去の行を読むために残す
// deleted_on_bluesky は、送ったかもしれない投稿が Bluesky 側に無かったとき。本人が Bluesky で消したとみなし、送り直さない
// fediverse_mention は、本文で Fediverse のアカウントにメンションしているとき。相手のいない Bluesky には送らない
export const BlueskySkipReason = z.enum([
  'visibility',
  'content_warning',
  'sensitive',
  'reply_to_unsent',
  'deleted_on_bluesky',
  'fediverse_mention',
]);
export type BlueskySkipReason = z.infer<typeof BlueskySkipReason>;

const blueskyCrosspostZodType = z.object({
  postId: PostId.zodType,
  // 送り先の Bluesky アカウントの持ち主（投稿者）
  userId: UserId.zodType,
  status: BlueskyCrosspostStatus,
  skipReason: BlueskySkipReason.nullable(),
  uri: z.string().nullable(),
  cid: z.string().nullable(),
  rkey: z.string().nullable(),
  rootUri: z.string().nullable(),
  rootCid: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: Instant.zodType,
  updatedAt: Instant.zodType,
});

export type BlueskyCrosspost = z.infer<typeof blueskyCrosspostZodType>;

const MAX_LAST_ERROR_LENGTH = 200;
export const MAX_BLUESKY_CROSSPOST_ATTEMPTS = 3;
export const MAX_BLUESKY_DELETE_ATTEMPTS = 5;

const empty = {
  skipReason: null,
  uri: null,
  cid: null,
  rkey: null,
  rootUri: null,
  rootCid: null,
  attempts: 0,
  lastError: null,
} as const;

export type BlueskySentRefs = Readonly<{
  uri: string;
  cid: string;
  rkey: string;
  rootUri: string | null;
  rootCid: string | null;
}>;

const pending = (postId: PostId, userId: UserId, now: Instant): BlueskyCrosspost => ({
  ...empty,
  postId,
  userId,
  status: 'pending',
  createdAt: now,
  updatedAt: now,
});

const skipped = (
  postId: PostId,
  userId: UserId,
  skipReason: BlueskySkipReason,
  now: Instant,
): BlueskyCrosspost => ({
  ...empty,
  postId,
  userId,
  status: 'skipped',
  skipReason,
  createdAt: now,
  updatedAt: now,
});

const markSkipped = (
  crosspost: BlueskyCrosspost,
  skipReason: BlueskySkipReason,
  now: Instant,
): BlueskyCrosspost => ({ ...crosspost, status: 'skipped', skipReason, lastError: null, updatedAt: now });

const markSent = (crosspost: BlueskyCrosspost, refs: BlueskySentRefs, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  ...refs,
  status: 'sent',
  skipReason: null,
  lastError: null,
  updatedAt: now,
});

const markSending = (crosspost: BlueskyCrosspost, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  attempts: crosspost.attempts + 1,
  updatedAt: now,
});

/**
 * レコードの作成を Bluesky に頼む直前に、使う rkey を残す。
 * 結果を残せないまま試行が終わっても、Bluesky 側にレコードができているかもしれないと分かるようにする
 */
const markCreating = (crosspost: BlueskyCrosspost, rkey: string, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  rkey,
  updatedAt: now,
});

/** 失敗を記録する。rkey は変えないので、作成を頼んだあとなら次の試行で Bluesky 側を確かめる */
const markFailed = (crosspost: BlueskyCrosspost, lastError: string, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  status: 'failed',
  lastError: lastError.slice(0, MAX_LAST_ERROR_LENGTH),
  updatedAt: now,
});

/** 作成を頼んで失敗し、Bluesky 側にもレコードが見つからなかった。次の試行はそのまま送り直してよい */
const markFailedWithoutRecord = (crosspost: BlueskyCrosspost, lastError: string, now: Instant): BlueskyCrosspost => ({
  ...markFailed(crosspost, lastError, now),
  rkey: null,
});

/** 送ったかもしれないレコードが Bluesky 側に無い。Bluesky で消されたとみなし、送り直さない */
const markDeletedOnBluesky = (crosspost: BlueskyCrosspost, now: Instant): BlueskyCrosspost => ({
  ...markSkipped(crosspost, 'deleted_on_bluesky', now),
  rkey: null,
});

/** 前の試行が作成を頼んだまま結果を残していない。Bluesky 側にレコードができているかもしれない */
const mayHaveRecord = (crosspost: BlueskyCrosspost): crosspost is BlueskyCrosspost & { rkey: string } =>
  (crosspost.status === 'pending' || crosspost.status === 'failed') && crosspost.rkey !== null;

const markDeleting = (crosspost: BlueskyCrosspost, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  status: 'deleting',
  attempts: 0,
  lastError: null,
  updatedAt: now,
});

const markDeleteFailed = (crosspost: BlueskyCrosspost, lastError: string, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  status: 'deleting',
  attempts: crosspost.attempts + 1,
  lastError: lastError.slice(0, MAX_LAST_ERROR_LENGTH),
  updatedAt: now,
});

const canRetry = (crosspost: BlueskyCrosspost): boolean =>
  (crosspost.status === 'pending' || crosspost.status === 'failed')
  && crosspost.attempts < MAX_BLUESKY_CROSSPOST_ATTEMPTS;

const canRetryDeletion = (crosspost: BlueskyCrosspost): boolean =>
  crosspost.status === 'deleting' && crosspost.rkey !== null
  && crosspost.attempts < MAX_BLUESKY_DELETE_ATTEMPTS;

export type BlueskyStrongRef = Readonly<{ uri: string; cid: string }>;

export type BlueskyReplyContext =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'sent'; root: BlueskyStrongRef; parent: BlueskyStrongRef }>;

export type BlueskyQuoteContext =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'sent'; uri: string; cid: string; quoteUri: string }>;

const decideSkip = (
  input: Readonly<{ visibility: Visibility; replyTo: BlueskyReplyContext; html: string }>,
): BlueskySkipReason | undefined => {
  if (input.visibility !== 'public') return 'visibility';
  if (input.replyTo.kind === 'unsent') return 'reply_to_unsent';
  // Fediverse のアカウント（bot を含む）に宛てた投稿は、Bluesky では宛先のない独り言になる
  if (mentionLinksOfHtml(input.html).length > 0) return 'fediverse_mention';
  return undefined;
};

export const BlueskyCrosspost = {
  ...Schema.create(blueskyCrosspostZodType),
  pending,
  skipped,
  markSkipped,
  markSent,
  markSending,
  markCreating,
  markFailed,
  markFailedWithoutRecord,
  markDeletedOnBluesky,
  mayHaveRecord,
  markDeleting,
  markDeleteFailed,
  canRetry,
  canRetryDeletion,
  decideSkip,
} as const;

export const BLUESKY_CROSSPOST_PENDING_GRACE_MS = 10 * 60 * 1000;
export const BLUESKY_CROSSPOST_RETRY_LIMIT = 20;
export const BLUESKY_CROSSPOST_RECENT_FAILURES_LIMIT = 10;

const blueskySessionZodType = z.object({
  did: z.string().min(1),
  handle: z.string().min(1),
  pdsUrl: z.string().min(1),
  accessJwt: z.string().min(1),
  refreshJwt: z.string().min(1),
  updatedAt: Instant.zodType,
});

export type BlueskySession = z.infer<typeof blueskySessionZodType>;
export const BlueskySession = Schema.create(blueskySessionZodType);

export type BlueskyCrosspostResolver = Agg.Resolver<PostId, BlueskyCrosspost | undefined>;
export type BlueskyCrosspostsResolverByRetryable = Agg.Resolver<
  { pendingCreatedBefore: Instant; maxAttempts: number; maxDeleteAttempts: number; limit: number },
  readonly BlueskyCrosspost[]
>;
export type BlueskyCrosspostFailure = Readonly<
  Pick<BlueskyCrosspost, 'postId' | 'status' | 'attempts' | 'lastError' | 'updatedAt'>
>;
export type BlueskyCrosspostStatusReport = Readonly<{
  counts: Readonly<Record<BlueskyCrosspostStatus, number>>;
  exhausted: Readonly<{ pending: number; failed: number; deleting: number }>;
  recentFailures: readonly BlueskyCrosspostFailure[];
}>;
export type BlueskyCrosspostStatusReportResolver = Agg.Resolver<
  { userId: UserId; maxAttempts: number; maxDeleteAttempts: number; failuresLimit: number },
  BlueskyCrosspostStatusReport
>;
export type BlueskyCrosspostSavedStore = Readonly<{
  save: (crosspost: BlueskyCrosspost) => RA<void, never>;
  update: (crosspost: BlueskyCrosspost) => RA<boolean, never>;
}>;
export type BlueskyCrosspostDeletedStore = Readonly<{
  delete: (postId: PostId) => RA<void, never>;
}>;
export type BlueskySessionResolver = Readonly<{
  resolve: () => RA<BlueskySession | undefined, never>;
}>;
export type BlueskySessionSavedStore = Readonly<{
  save: (session: BlueskySession) => RA<void, never>;
}>;
export type BlueskySessionDeletedStore = Readonly<{
  delete: () => RA<void, never>;
}>;
export type BlueskyLoginFailureResolver = Readonly<{
  resolve: () => RA<Instant | undefined, never>;
}>;
export type BlueskyLoginFailureSavedStore = Readonly<{
  save: (failedAt: Instant) => RA<void, never>;
}>;
export type BlueskyLoginFailureDeletedStore = Readonly<{
  delete: () => RA<void, never>;
}>;
