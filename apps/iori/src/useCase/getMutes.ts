import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { Mute, MutesResolverByUserId } from '../domain/mute/mute.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
}>;

type Ok = ReadonlyArray<Mute>;

type Err =
  | SessionExpiredError
  | UserNotFoundError;

export type GetMutesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  mutesResolverByUserId: MutesResolverByUserId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  mutesResolverByUserId,
}: Deps): GetMutesUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andThen(({ user }) => mutesResolverByUserId.resolve(user.id)),
    );

  return { run };
};

export const GetMutesUseCase = {
  create,
} as const;
