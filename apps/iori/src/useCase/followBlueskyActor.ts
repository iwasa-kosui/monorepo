import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string; followUri?: string | undefined }>;

type Ok = Readonly<{ following: true; followUri: string }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type FollowBlueskyActorUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  client: Pick<BlueskyClient, 'createFollow' | 'getRecord'>;
}>;

const FOLLOW_COLLECTION = 'app.bsky.graph.follow';
const followUriPattern = /^at:\/\/[^/]+\/app\.bsky\.graph\.follow\/([^/]+)$/;

const isRecordMissing = (error: BlueskyClientError): boolean =>
  error.kind === 'http' && (error.status === 404 || error.code === 'RecordNotFound');

const create = ({ reader, client }: Deps): FollowBlueskyActorUseCase => {
  const run = async ({ did, followUri }: Input): RA<Ok, Err> => {
    const profile = await reader.getProfile(did);
    if (!profile.ok) {
      return RA.err(isBlueskyProfileNotFound(profile.err) ? { type: 'BlueskyProfileNotFound' } : profile.err);
    }
    const candidates = new Set([followUri, profile.val.viewerFollowingUri]);
    for (const candidate of candidates) {
      const rkey = candidate === undefined ? undefined : followUriPattern.exec(candidate)?.[1];
      if (rkey === undefined) continue;
      const found = await client.getRecord(rkey, FOLLOW_COLLECTION);
      if (found.ok) return RA.ok({ following: true, followUri: found.val.uri });
      if (!isRecordMissing(found.err)) return RA.err(found.err);
    }
    const created = await client.createFollow(did);
    return created.ok ? RA.ok({ following: true, followUri: created.val.uri }) : RA.err(created.err);
  };

  return { run };
};

export const FollowBlueskyActorUseCase = {
  create,
} as const;
