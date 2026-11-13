import { RA } from '@iwasa-kosui/result';

import {
  type BlueskyProfileImageInput,
  BlueskyProfileInput,
  type BlueskyProfileInvalid,
} from '../domain/blueskyProfile/blueskyProfileInput.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  displayName: string;
  description: string;
  avatar?: BlueskyProfileImageInput | undefined;
  banner?: BlueskyProfileImageInput | undefined;
  removeAvatar: boolean;
  removeBanner: boolean;
}>;

type Ok = Readonly<{ uri: string; cid: string }>;

type Err = BlueskyClientError | BlueskyProfileInvalid;

export type UpdateBlueskyProfileUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'getProfileRecord' | 'putProfileRecord' | 'uploadBlob'>;
  now: () => Instant;
}>;

const PROFILE_COLLECTION = 'app.bsky.actor.profile';

const withField = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  value: unknown,
): Readonly<Record<string, unknown>> => {
  const rest = Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
  return value === undefined ? rest : { ...rest, [key]: value };
};

const create = ({ client, now }: Deps): UpdateBlueskyProfileUseCase => {
  const run = async (input: Input): RA<Ok, Err> => {
    const validated = BlueskyProfileInput.validate(input);
    if (!validated.ok) return RA.err(validated.err);
    const current = await client.getProfileRecord();
    if (!current.ok) return RA.err(current.err);
    let record: Readonly<Record<string, unknown>> = {
      ...(current.val === undefined ? { createdAt: new Date(now()).toISOString() } : current.val.value),
      $type: PROFILE_COLLECTION,
    };
    record = withField(record, 'displayName', validated.val.displayName === '' ? undefined : validated.val.displayName);
    record = withField(record, 'description', validated.val.description === '' ? undefined : validated.val.description);
    for (
      const [key, image, remove] of [
        ['avatar', input.avatar, input.removeAvatar],
        ['banner', input.banner, input.removeBanner],
      ] as const
    ) {
      if (image !== undefined) {
        const blob = await client.uploadBlob(image);
        if (!blob.ok) return RA.err(blob.err);
        record = withField(record, key, blob.val);
      } else if (remove) {
        record = withField(record, key, undefined);
      }
    }
    return client.putProfileRecord(record, current.val?.cid);
  };

  return { run };
};

export const UpdateBlueskyProfileUseCase = {
  create,
} as const;
