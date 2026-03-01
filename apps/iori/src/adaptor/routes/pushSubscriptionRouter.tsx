import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { SessionId } from '../../domain/session/sessionId.ts';
import { Env } from '../../env.ts';
import {
  type SubscribePushUseCase,
  SubscribePushUseCase as SubscribePushUseCaseImpl,
} from '../../useCase/subscribePush.ts';
import {
  type UnsubscribePushUseCase,
  UnsubscribePushUseCase as UnsubscribePushUseCaseImpl,
} from '../../useCase/unsubscribePush.ts';
import type { InferUseCaseError } from '../../useCase/useCase.ts';
import { PgPushSubscriptionCreatedStore } from '../pg/pushSubscription/pushSubscriptionCreatedStore.ts';
import { PgPushSubscriptionDeletedStore } from '../pg/pushSubscription/pushSubscriptionDeletedStore.ts';
import { PgPushSubscriptionResolverByEndpoint } from '../pg/pushSubscription/pushSubscriptionResolverByEndpoint.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';

const app = new Hono()
  .get('/v1/push/vapid-public-key', (c) => {
    const env = Env.getInstance();
    return c.json({ publicKey: env.VAPID_PUBLIC_KEY });
  })
  .post(
    '/v1/push/subscribe',
    sValidator(
      'json',
      z.object({
        endpoint: z.url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      }),
    ),
    async (c) => {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const sessionIdResult = SessionId.parse(sessionId);
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const body = c.req.valid('json');

      const useCase = SubscribePushUseCaseImpl.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        pushSubscriptionCreatedStore: PgPushSubscriptionCreatedStore.getInstance(),
        pushSubscriptionResolverByEndpoint: PgPushSubscriptionResolverByEndpoint.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        endpoint: body.endpoint,
        p256dhKey: body.keys.p256dh,
        authKey: body.keys.auth,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err: InferUseCaseError<SubscribePushUseCase>) => c.json({ error: err.message }, 400),
      })(result);
    },
  )
  .delete(
    '/v1/push/subscribe',
    sValidator(
      'json',
      z.object({
        endpoint: z.url(),
      }),
    ),
    async (c) => {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const sessionIdResult = SessionId.parse(sessionId);
      if (!sessionIdResult.ok) {
        return c.json({ error: 'Invalid session' }, 401);
      }

      const body = c.req.valid('json');

      const useCase = UnsubscribePushUseCaseImpl.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        pushSubscriptionDeletedStore: PgPushSubscriptionDeletedStore.getInstance(),
        pushSubscriptionResolverByEndpoint: PgPushSubscriptionResolverByEndpoint.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        endpoint: body.endpoint,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err: InferUseCaseError<UnsubscribePushUseCase>) => c.json({ error: err.message }, 400),
      })(result);
    },
  );

export { app as PushSubscriptionRouter };
