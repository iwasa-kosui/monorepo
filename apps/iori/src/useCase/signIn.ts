import type { Context } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { Password } from '../domain/password/password.ts';
import type { UserPasswordResolver } from '../domain/password/userPassword.ts';
import { Session, type SessionStartedStore } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { User, UserResolverByUsername } from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import { resolveUserByUsernameWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  username: Username;
  password: Password;
  ctx: Context<unknown>;
}>;

type Ok = Readonly<{
  sessionId: SessionId;
}>;

type UsernameOrPasswordInvalid = Readonly<{
  type: 'UsernameOrPasswordInvalid';
  message: string;
  detail: {
    username: Username;
  };
}>;

const UsernameOrPasswordInvalid = {
  create: (username: Username): UsernameOrPasswordInvalid => ({
    type: 'UsernameOrPasswordInvalid',
    message: 'Username or password is invalid.',
    detail: { username },
  }),
} as const;

type SignInUseCase = UseCase<
  Input,
  Ok,
  UsernameOrPasswordInvalid
>;

export type SignInDeps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  userPasswordResolver: UserPasswordResolver;
  sessionStartedStore: SessionStartedStore;
  argon2idDerive: Argon2idDerive;
}>;

const create = ({
  userResolverByUsername,
  userPasswordResolver,
  sessionStartedStore,
  argon2idDerive,
}: SignInDeps): SignInUseCase => {
  const now = Instant.now();
  const resolveUser = (username: Username): RA<User, UsernameOrPasswordInvalid> =>
    RA.flow(
      resolveUserByUsernameWith(userResolverByUsername)(username),
      RA.mapErr(() => UsernameOrPasswordInvalid.create(username)),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ username }) => resolveUser(username)),
      RA.andBind('userPassword', ({ user }) => userPasswordResolver.resolve(user.id)),
      RA.andThen(async ({ user, userPassword }) => {
        if (!userPassword) {
          return RA.err(UsernameOrPasswordInvalid.create(user.username));
        }
        const isPasswordValid = await Password.verifyPassword(argon2idDerive)(
          userPassword.hashedPassword,
          input.password,
        );
        if (!isPasswordValid) {
          return RA.err(UsernameOrPasswordInvalid.create(user.username));
        }
        return RA.ok({ user });
      }),
      RA.bind('sessionStarted', ({ user }) =>
        Session.startSession(now)({
          userId: user.id,
          expires: Instant.addDuration(now, 1000 * 60 * 60 * 24 * 7), // 7 days
        })),
      RA.andThrough(({ sessionStarted }) => sessionStartedStore.store(sessionStarted)),
      RA.bind('sessionId', ({ sessionStarted }) => sessionStarted.aggregateState.sessionId),
    );

  return { run };
};

export const createSignInUseCase = (deps: SignInDeps): SignInUseCase => create(deps);

export const SignInUseCase = {
  create,
} as const;
