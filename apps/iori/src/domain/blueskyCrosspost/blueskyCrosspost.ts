import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';

export const BlueskyCrosspostStatus = z.enum(['pending', 'sent', 'failed', 'skipped']);
export type BlueskyCrosspostStatus = z.infer<typeof BlueskyCrosspostStatus>;

export const BlueskySkipReason = z.enum(['content_warning', 'sensitive', 'reply_to_unsent']);
export type BlueskySkipReason = z.infer<typeof BlueskySkipReason>;

const blueskyCrosspostZodType = z.object({
  postId: PostId.zodType,
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

const pending = (postId: PostId, now: Instant): BlueskyCrosspost => ({
  ...empty,
  postId,
  status: 'pending',
  createdAt: now,
  updatedAt: now,
});

const skipped = (postId: PostId, skipReason: BlueskySkipReason, now: Instant): BlueskyCrosspost => ({
  ...empty,
  postId,
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

const markFailed = (crosspost: BlueskyCrosspost, lastError: string, now: Instant): BlueskyCrosspost => ({
  ...crosspost,
  status: 'failed',
  attempts: crosspost.attempts + 1,
  lastError: lastError.slice(0, MAX_LAST_ERROR_LENGTH),
  updatedAt: now,
});

export type BlueskyStrongRef = Readonly<{ uri: string; cid: string }>;

export type BlueskyReplyContext =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'sent'; root: BlueskyStrongRef; parent: BlueskyStrongRef }>;

const decideSkip = (
  input: Readonly<{ summary: string | null; sensitive: boolean; replyTo: BlueskyReplyContext }>,
): BlueskySkipReason | undefined => {
  if (input.summary !== null && input.summary.trim() !== '') return 'content_warning';
  if (input.sensitive) return 'sensitive';
  if (input.replyTo.kind === 'unsent') return 'reply_to_unsent';
  return undefined;
};

export const BlueskyCrosspost = {
  ...Schema.create(blueskyCrosspostZodType),
  pending,
  skipped,
  markSkipped,
  markSent,
  markFailed,
  decideSkip,
} as const;

export const MAX_BLUESKY_CROSSPOST_ATTEMPTS = 3;
export const BLUESKY_CROSSPOST_PENDING_GRACE_MS = 10 * 60 * 1000;
export const BLUESKY_CROSSPOST_RETRY_LIMIT = 20;

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
  { pendingCreatedBefore: Instant; maxAttempts: number; limit: number },
  readonly BlueskyCrosspost[]
>;
export type BlueskyCrosspostSavedStore = Readonly<{
  save: (crosspost: BlueskyCrosspost) => RA<void, never>;
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
