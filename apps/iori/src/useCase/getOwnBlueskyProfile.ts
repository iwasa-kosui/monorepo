import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError, BlueskyProfileRecord } from '../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

export type OwnBlueskyProfile = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  cid: string | null;
}>;

export type GetOwnBlueskyProfileUseCase = UseCase<void, OwnBlueskyProfile, BlueskyClientError>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  client: Pick<BlueskyClient, 'getProfileRecord'>;
  viewerDid: () => RA<string, BlueskyClientError>;
}>;

const stringOrNull = (value: unknown): string | null => typeof value === 'string' ? value : null;

const toOwnProfile = (profile: BlueskyProfile, record: BlueskyProfileRecord | undefined): OwnBlueskyProfile => ({
  did: profile.did,
  handle: profile.handle,
  displayName: stringOrNull(record?.value['displayName']),
  description: stringOrNull(record?.value['description']),
  avatar: profile.avatar,
  banner: profile.banner,
  cid: record?.cid ?? null,
});

const create = ({ reader, client, viewerDid }: Deps): GetOwnBlueskyProfileUseCase => {
  const run = async (): RA<OwnBlueskyProfile, BlueskyClientError> => {
    const did = await viewerDid();
    if (!did.ok) return did;
    const [profile, record] = await Promise.all([reader.getProfile(did.val), client.getProfileRecord()]);
    if (!profile.ok) return profile;
    if (!record.ok) return record;
    return RA.ok(toOwnProfile(profile.val, record.val));
  };

  return { run };
};

export const GetOwnBlueskyProfileUseCase = {
  create,
} as const;
