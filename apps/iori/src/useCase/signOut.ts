import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import { Session, type SessionEndedStore, type SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId | undefined;
}>;

export type SignOutUseCase = UseCase<Input, void, never>;

export type SignOutDeps = Readonly<{
  sessionResolver: SessionResolver;
  sessionEndedStore: SessionEndedStore;
}>;

const create = ({ sessionResolver, sessionEndedStore }: SignOutDeps): SignOutUseCase => {
  const run = async ({ sessionId }: Input) => {
    if (sessionId === undefined) return RA.ok(undefined);
    const now = Instant.now();
    return RA.flow(
      sessionResolver.resolve(sessionId),
      RA.andThen((session) =>
        session === undefined
          ? RA.ok(undefined)
          : sessionEndedStore.store(Session.endSession(now)(session))
      ),
    );
  };

  return { run };
};

export const SignOutUseCase = {
  create,
} as const;
