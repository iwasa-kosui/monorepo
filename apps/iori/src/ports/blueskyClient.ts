import type { RA } from '@iwasa-kosui/result';

import type { BlueskyBlob, BlueskyPostRecord } from '../domain/blueskyCrosspost/blueskyPostRecord.ts';

export type BlueskyClientErrorKind = 'auth' | 'http' | 'network' | 'invalid_response';

export type BlueskyClientError = Readonly<{
  type: 'BlueskyClientError';
  kind: BlueskyClientErrorKind;
  message: string;
  status?: number;
}>;

export type BlueskyCreatedRecord = Readonly<{ uri: string; cid: string; rkey: string }>;

export type BlueskyClient = Readonly<{
  uploadBlob: (input: Readonly<{ bytes: Uint8Array; mimeType: string }>) => RA<BlueskyBlob, BlueskyClientError>;
  createRecord: (record: BlueskyPostRecord) => RA<BlueskyCreatedRecord, BlueskyClientError>;
  deleteRecord: (rkey: string) => RA<void, BlueskyClientError>;
}>;

export type BlueskyThumbnail = Readonly<{ bytes: Uint8Array; mimeType: string }>;

export type BlueskyThumbnailFetcher = Readonly<{
  fetch: (url: string) => Promise<BlueskyThumbnail | undefined>;
}>;
