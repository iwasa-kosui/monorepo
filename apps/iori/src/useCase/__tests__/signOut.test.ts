import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { Session, SessionEnded, SessionEndedStore } from '../../domain/session/session.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { SignOutUseCase } from '../signOut.ts';
import { createMockSessionResolver } from './helper/mockAdaptors.ts';

describe('SignOutUseCase', () => {
  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const sessionEndedStore: SessionEndedStore & { store: ReturnType<typeof vi.fn> } = {
      store: vi.fn(async () => ({ ok: true, val: undefined })) as never,
    };
    return { sessionResolver, sessionEndedStore };
  };

  const createSession = (): Session => ({
    sessionId: SessionId.generate(),
    userId: UserId.generate(),
    expires: Instant.addDuration(Instant.now(), 60 * 1000),
  });

  it('あるセッションに session.ended を作って保存する', async () => {
    const deps = createDeps();
    const session = createSession();
    deps.sessionResolver.setSession(session);

    const result = await SignOutUseCase.create(deps).run({ sessionId: session.sessionId });

    expect(result.ok).toBe(true);
    expect(deps.sessionEndedStore.store).toHaveBeenCalledTimes(1);
    const [event] = deps.sessionEndedStore.store.mock.calls[0] as unknown as [SessionEnded];
    expect(event.eventName).toBe('session.ended');
    expect(event.aggregateId).toBe(session.sessionId);
    expect(event.aggregateState).toBeUndefined();
    expect(event.eventPayload).toEqual({ sessionId: session.sessionId, userId: session.userId });
  });

  it('セッションが無ければ何も保存せず成功にする', async () => {
    const deps = createDeps();

    const result = await SignOutUseCase.create(deps).run({ sessionId: SessionId.generate() });

    expect(result.ok).toBe(true);
    expect(deps.sessionEndedStore.store).not.toHaveBeenCalled();
  });

  it('sessionId が無ければ解決せず成功にする', async () => {
    const deps = createDeps();

    const result = await SignOutUseCase.create(deps).run({ sessionId: undefined });

    expect(result.ok).toBe(true);
    expect(deps.sessionResolver.resolve).not.toHaveBeenCalled();
    expect(deps.sessionEndedStore.store).not.toHaveBeenCalled();
  });
});
