import { RA } from '@iwasa-kosui/result';

import type { PasskeyCredential, PasskeyCredentialsResolverByUserId } from '../domain/passkey/passkeyCredential.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
}>;

type Ok = Readonly<{
  credentials: ReadonlyArray<PasskeyCredential>;
}>;

export type ListPasskeysUseCase = UseCase<Input, Ok, never>;

export type ListPasskeysDeps = Readonly<{
  passkeyCredentialsResolverByUserId: PasskeyCredentialsResolverByUserId;
}>;

const create = ({ passkeyCredentialsResolverByUserId }: ListPasskeysDeps): ListPasskeysUseCase => {
  const run = async ({ userId }: Input) =>
    RA.flow(
      passkeyCredentialsResolverByUserId.resolve(userId),
      RA.map((credentials) => ({ credentials })),
    );

  return { run };
};

export const ListPasskeysUseCase = {
  create,
} as const;
