import { RA } from '@iwasa-kosui/result';

import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { Password } from '../domain/password/password.ts';
import type { UserPasswordResolver } from '../domain/password/userPassword.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId; password: string }>;

export type InvalidCurrentPassword = Readonly<{
  type: 'InvalidCurrentPassword';
  message: string;
}>;

export const InvalidCurrentPassword = {
  create: (): InvalidCurrentPassword => ({
    type: 'InvalidCurrentPassword',
    message: 'Current password is invalid.',
  }),
} as const;

export type VerifyCurrentPasswordUseCase = UseCase<Input, void, InvalidCurrentPassword>;

type Deps = Readonly<{
  userPasswordResolver: UserPasswordResolver;
  argon2idDerive: Argon2idDerive;
}>;

const create = ({ userPasswordResolver, argon2idDerive }: Deps): VerifyCurrentPasswordUseCase => {
  const run = async ({ userId, password }: Input): RA<void, InvalidCurrentPassword> => {
    const parsed = Password.of(password);
    if (!parsed.ok) return RA.err(InvalidCurrentPassword.create());
    const resolved = await userPasswordResolver.resolve(userId);
    if (!resolved.ok || resolved.val === undefined) return RA.err(InvalidCurrentPassword.create());
    const valid = await Password.verifyPassword(argon2idDerive)(resolved.val.hashedPassword, parsed.val);
    return valid ? RA.ok(undefined) : RA.err(InvalidCurrentPassword.create());
  };

  return { run };
};

export const VerifyCurrentPasswordUseCase = { create } as const;
