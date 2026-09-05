import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createGetUnreadNotificationCountUseCase } from '../getUnreadNotificationCount.ts';

describe('createGetUnreadNotificationCountUseCase', () => {
  it('resolves the authenticated user before returning the unread count', async () => {
    const sessionId = SessionId.generate();
    const userId = UserId.generate();
    const useCase = createGetUnreadNotificationCountUseCase({
      sessionResolver: {
        resolve: async () =>
          RA.ok({
            sessionId,
            userId,
            expires: Instant.orThrow(Date.now() + 60_000),
          }),
      },
      userResolver: {
        resolve: async () => RA.ok({ id: userId, username: Username.orThrow('kosui') }),
      },
      unreadNotificationCountResolverByUserId: {
        resolve: async (resolvedUserId) => RA.ok(resolvedUserId === userId ? 7 : 0),
      },
    });

    await expect(useCase.run({ sessionId })).resolves.toEqual({ ok: true, val: 7, err: undefined });
  });
});
