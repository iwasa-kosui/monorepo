import type { RA } from '@iwasa-kosui/result';

import type { BlueskyBlob, BlueskyPostRecord } from '../domain/blueskyCrosspost/blueskyPostRecord.ts';
import type { BlueskyReportReasonType } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';

export type BlueskyClientErrorKind = 'auth' | 'http' | 'network' | 'invalid_response' | 'chat_not_permitted';

export type BlueskyClientError = Readonly<{
  type: 'BlueskyClientError';
  kind: BlueskyClientErrorKind;
  message: string;
  status?: number;
  code?: string;
}>;

export type BlueskyCreatedRecord = Readonly<{ uri: string; cid: string; rkey: string }>;

export type BlueskyFetchedRecord = BlueskyCreatedRecord & Readonly<{ value?: unknown }>;

export type BlueskyLikeSubject = Readonly<{ uri: string; cid: string }>;

export type BlueskyReportInput = Readonly<{
  subjectDid: string;
  reasonType: BlueskyReportReasonType;
  reason?: string;
}>;

export type BlueskyRecordCollection = 'app.bsky.feed.post' | 'app.bsky.graph.follow';

export type BlueskyClient = Readonly<{
  uploadBlob: (input: Readonly<{ bytes: Uint8Array; mimeType: string }>) => RA<BlueskyBlob, BlueskyClientError>;
  createRecord: (record: BlueskyPostRecord, rkey: string) => RA<BlueskyCreatedRecord, BlueskyClientError>;
  getRecord: (rkey: string, collection?: BlueskyRecordCollection) => RA<BlueskyFetchedRecord, BlueskyClientError>;
  deleteRecord: (rkey: string) => RA<void, BlueskyClientError>;
  createLike: (subject: BlueskyLikeSubject, rkey: string) => RA<Readonly<{ uri: string }>, BlueskyClientError>;
  deleteLike: (rkey: string) => RA<void, BlueskyClientError>;
  createRepost: (subject: BlueskyLikeSubject, rkey: string) => RA<Readonly<{ uri: string }>, BlueskyClientError>;
  deleteRepost: (rkey: string) => RA<void, BlueskyClientError>;
  muteActor: (actor: string) => RA<void, BlueskyClientError>;
  unmuteActor: (actor: string) => RA<void, BlueskyClientError>;
  createBlock: (subjectDid: string) => RA<Readonly<{ uri: string }>, BlueskyClientError>;
  deleteBlock: (blockUri: string) => RA<void, BlueskyClientError>;
  createReport: (input: BlueskyReportInput) => RA<void, BlueskyClientError>;
  createFollow: (subjectDid: string) => RA<Readonly<{ uri: string }>, BlueskyClientError>;
  deleteFollow: (followUri: string) => RA<void, BlueskyClientError>;
  updateSeen: (seenAt: Instant) => RA<void, BlueskyClientError>;
}>;

export type BlueskyQueryClient = Readonly<{
  query: (
    nsid: string,
    params: Readonly<Record<string, string>>,
  ) => RA<Readonly<Record<string, unknown>>, BlueskyClientError>;
}>;

export type BlueskyChatClient = Readonly<{
  chatQuery: (
    nsid: string,
    params: Readonly<Record<string, string | readonly string[]>>,
  ) => RA<Readonly<Record<string, unknown>>, BlueskyClientError>;
  chatProcedure: (
    nsid: string,
    body: Readonly<Record<string, unknown>>,
  ) => RA<Readonly<Record<string, unknown>>, BlueskyClientError>;
  viewerDid: () => RA<string, BlueskyClientError>;
}>;

export type BlueskyThumbnail = Readonly<{ bytes: Uint8Array; mimeType: string }>;

export type BlueskyThumbnailFetcher = Readonly<{
  fetch: (url: string) => Promise<BlueskyThumbnail | undefined>;
}>;
