import type { Context } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { LocalActorCreatedStore } from '../domain/actor/createLocalActor.ts';
import { LocalActor } from '../domain/actor/localActor.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Password } from '../domain/password/password.ts';
import { UserPassword } from '../domain/password/userPassword.ts';
import type { UserPasswordSetStore } from './../domain/password/userPassword.ts';
import type { UserCreatedStore } from '../domain/user/createUser.ts';
import {
  UnacceptableUsernameError,
  User,
  UsernameAlreadyTakenError,
  type UserResolverByUsername,
} from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  username: Username;
  password: Password;
  ctx: Context<unknown>;
}>;

type Ok = Readonly<{
  user: User;
}>;

type SignUpUseCase = UseCase<
  Input,
  Ok,
  UsernameAlreadyTakenError | UnacceptableUsernameError
>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  userCreatedStore: UserCreatedStore;
  localActorCreatedStore: LocalActorCreatedStore;
  userPasswordSetStore: UserPasswordSetStore;
}>;

const create = ({
  userResolverByUsername,
  userCreatedStore,
  localActorCreatedStore,
  userPasswordSetStore,
}: Deps): SignUpUseCase => {
  const errIfUsernameTaken = (
    existingUser: User | undefined,
  ): RA<void, UsernameAlreadyTakenError> => {
    if (existingUser) {
      return RA.err(UsernameAlreadyTakenError.create(existingUser.username));
    }
    return RA.ok(undefined);
  };
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andThrough(({ username }) => User.checkIfUsernameAcceptable(username)),
      RA.andBind('existingUser', ({ username }) => userResolverByUsername.resolve(username)),
      RA.andThrough(({ existingUser }) => errIfUsernameTaken(existingUser)),
      RA.mapErr((x) => x),
      RA.bind('userCreated', ({ username }) => User.createUser(now)({ username })),
      RA.andThrough(({ userCreated }) => userCreatedStore.store(userCreated)),
      RA.bind('user', ({ userCreated }) => userCreated.aggregateState),
      RA.bind('localActorCreated', ({ user, ctx }) => LocalActor.createLocalActor(user, ctx, now)),
      RA.andThrough(({ user }) => {
        const hashedPassword = Password.hashPassword(input.password);
        const userPasswordSet = UserPassword.setUserPassword(now)({
          userId: user.id,
          hashedPassword,
        });
        return userPasswordSetStore.store(userPasswordSet);
      }),
      RA.andThrough(({ localActorCreated }) => localActorCreatedStore.store(localActorCreated)),
    );

  return { run };
};

export const SignUpUseCase = {
  create,
} as const;
