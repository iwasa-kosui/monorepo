import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string; followUri?: string | undefined }>;

type Ok = Readonly<{ following: false }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type UnfollowBlueskyActorUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  client: Pick<BlueskyClient, 'deleteFollow'>;
}>;

const followUriPattern = /^at:\/\/[^/]+\/app\.bsky\.graph\.follow\/[^/]+$/;

const create = ({ reader, client }: Deps): UnfollowBlueskyActorUseCase => {
  const run = async ({ did, followUri }: Input): RA<Ok, Err> => {
    const profile = await reader.getProfile(did);
    if (!profile.ok) {
      return RA.err(isBlueskyProfileNotFound(profile.err) ? { type: 'BlueskyProfileNotFound' } : profile.err);
    }
    const viewerFollowingUri = profile.val.viewerFollowingUri;
    const target = followUri ?? viewerFollowingUri;
    if (target === undefined) return RA.ok({ following: false });
    const targets = viewerFollowingUri !== undefined && viewerFollowingUri !== target
        && followUriPattern.test(target) && followUriPattern.test(viewerFollowingUri)
      ? [target, viewerFollowingUri]
      : [target];
    for (const uri of targets) {
      const deleted = await client.deleteFollow(uri);
      if (!deleted.ok) return RA.err(deleted.err);
    }
    return RA.ok({ following: false });
  };

  return { run };
};

export const UnfollowBlueskyActorUseCase = {
  create,
} as const;
