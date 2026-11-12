import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Instant } from '../instant/instant.ts';

export const BLUESKY_REPORT_COMMENT_MAX_LENGTH = 2000;

const reportCategoryZodType = z.enum(['spam', 'offensive', 'other']);
export type BlueskyReportCategory = z.infer<typeof reportCategoryZodType>;
export const BlueskyReportCategory = Schema.create(reportCategoryZodType);

export const BlueskyReportComment = Schema.create(z.string().trim().max(BLUESKY_REPORT_COMMENT_MAX_LENGTH));

export const BlueskyDid = Schema.create(z.string().startsWith('did:').max(2048));

export type BlueskyReportReasonType =
  | 'com.atproto.moderation.defs#reasonSpam'
  | 'com.atproto.moderation.defs#reasonRude'
  | 'com.atproto.moderation.defs#reasonOther';

export const blueskyReportReasonType = (category: BlueskyReportCategory): BlueskyReportReasonType => {
  switch (category) {
    case 'spam':
      return 'com.atproto.moderation.defs#reasonSpam';
    case 'offensive':
      return 'com.atproto.moderation.defs#reasonRude';
    case 'other':
      return 'com.atproto.moderation.defs#reasonOther';
  }
};

export const BLUESKY_BLOCK_COLLECTION = 'app.bsky.graph.block';

const blockUriPattern = /^at:\/\/([^/]+)\/app\.bsky\.graph\.block\/([^/]+)$/;

export const blueskyBlockUri = (uri: string | null | undefined): string | undefined =>
  uri === null || uri === undefined || !blockUriPattern.test(uri) ? undefined : uri;

export const parseBlueskyBlockUri = (uri: string): Readonly<{ repo: string; rkey: string }> | undefined => {
  const match = blockUriPattern.exec(uri);
  return match?.[1] === undefined || match[2] === undefined ? undefined : { repo: match[1], rkey: match[2] };
};

export type BlueskyModerationState = Readonly<{
  muted: boolean;
  blockUri: string | null;
}>;

export type BlueskyModerationValidationError = Readonly<{
  type: 'BlueskyModerationValidationError';
  field: 'comment';
}>;

export type BlueskyModeratedActorsResolver = Readonly<{
  resolveExcludedDids: () => RA<ReadonlySet<string>, never>;
  resolveState: (did: string) => RA<BlueskyModerationState, never>;
}>;
export type BlueskyMuteSavedStore = Readonly<{
  save: (did: string, at: Instant) => RA<void, never>;
}>;
export type BlueskyMuteDeletedStore = Readonly<{
  delete: (did: string, at: Instant) => RA<void, never>;
}>;
export type BlueskyBlockSavedStore = Readonly<{
  save: (did: string, blockUri: string, at: Instant) => RA<void, never>;
}>;
export type BlueskyBlockDeletedStore = Readonly<{
  delete: (did: string, at: Instant) => RA<void, never>;
}>;
