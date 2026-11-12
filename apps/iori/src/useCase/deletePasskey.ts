import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  PasskeyCredential,
  PasskeyCredentialNotFoundError,
  type PasskeyCredentialResolverByCredentialId,
  type PasskeyDeletedStore,
} from '../domain/passkey/passkeyCredential.ts';
import type { PasskeyCredentialId } from '../domain/passkey/passkeyCredentialId.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  credentialId: PasskeyCredentialId;
}>;

type Ok = Readonly<{
  credentialId: PasskeyCredentialId;
}>;

export type DeletePasskeyUseCase = UseCase<Input, Ok, PasskeyCredentialNotFoundError>;

export type DeletePasskeyDeps = Readonly<{
  passkeyCredentialResolverByCredentialId: PasskeyCredentialResolverByCredentialId;
  passkeyDeletedStore: PasskeyDeletedStore;
}>;

const create = ({
  passkeyCredentialResolverByCredentialId,
  passkeyDeletedStore,
}: DeletePasskeyDeps): DeletePasskeyUseCase => {
  const run = async ({ userId, credentialId }: Input) => {
    const now = Instant.now();
    return RA.flow(
      passkeyCredentialResolverByCredentialId.resolve(credentialId),
      RA.andThen((credential) =>
        credential === undefined || credential.userId !== userId
          ? RA.err(PasskeyCredentialNotFoundError.create(credentialId))
          : RA.ok(credential)
      ),
      RA.map(PasskeyCredential.remove(now)),
      RA.andThrough((deleted) => passkeyDeletedStore.store(deleted)),
      RA.map(() => ({ credentialId })),
    );
  };

  return { run };
};

export const DeletePasskeyUseCase = {
  create,
} as const;
