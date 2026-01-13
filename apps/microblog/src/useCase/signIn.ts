import type { Context } from "@fedify/fedify";
import { Password } from "../domain/password/password.ts";
import type { Username } from "../domain/user/username.ts";
import type { User, UserResolverByUsername } from "../domain/user/user.ts";
import type { UseCase } from "./useCase.ts";
import type { UserPasswordResolver, UserPasswordSetStore } from "../domain/password/userPassword.ts";
import { Session, type SessionStartedStore } from "../domain/session/session.ts";
import { Instant } from "../domain/instant/instant.ts";
import { RA } from "@iwasa-kosui/result";
import type { SessionId } from "../domain/session/sessionId.ts";
import { resolveUserByUsernameWith } from "./helper/resolve.ts";

type Input = Readonly<{
  username: Username
  password: Password
  ctx: Context<unknown>
}>;

type Ok = Readonly<{
  sessionId: SessionId;
}>;

type UsernameOrPasswordInvalid = Readonly<{
  type: 'UsernameOrPasswordInvalid';
  message: string;
  detail: {
    username: Username;
  }
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

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  userPasswordResolver: UserPasswordResolver
  sessionStartedStore: SessionStartedStore;
}>;

const create = ({
  userResolverByUsername,
  userPasswordResolver,
  sessionStartedStore,
}: Deps): SignInUseCase => {
  const now = Instant.now();
  const resolveUser = (username: Username): RA<User, UsernameOrPasswordInvalid> =>
    RA.flow(
      resolveUserByUsernameWith(userResolverByUsername)(username),
      RA.mapErr(() => UsernameOrPasswordInvalid.create(username))
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ username }) =>
        resolveUser(username)
      ),
      RA.andBind('userPassword', ({ user }) =>
        userPasswordResolver.resolve(user.id)
      ),
      RA.andThen(({ user, userPassword }) => {
        if (!userPassword) {
          return RA.err(UsernameOrPasswordInvalid.create(user.username));
        }
        const isPasswordValid = Password.verifyPassword(
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
        })
      ),
      RA.andThrough(({ sessionStarted }) =>
        sessionStartedStore.store(sessionStarted)
      ),
      RA.bind('sessionId', ({ sessionStarted }) => sessionStarted.aggregateState.sessionId),
    );

  return { run };
};

export const SignInUseCase = {
  create,
} as const;
