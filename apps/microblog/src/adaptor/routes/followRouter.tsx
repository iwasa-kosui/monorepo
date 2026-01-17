import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import z from 'zod/v4';

import { SessionId } from '../../domain/session/sessionId.ts';
import { Federation } from '../../federation.ts';
import { Layout } from '../../layout.tsx';
import { SendFollowRequestUseCase } from '../../useCase/sendFollowRequest.ts';
import { FedifyRemoteActorLookup } from '../fedify/remoteActorLookup.ts';
import { PgActorResolverByUri } from '../pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgLogoUriUpdatedStore } from '../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../pg/actor/remoteActorCreatedStore.ts';
import { PgFollowRequestedStore } from '../pg/follow/followRequestedStore.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';

const app = new Hono();

app.get(
  '/',
  sValidator(
    'query',
    z.object({
      uri: z.string().optional(),
    }),
  ),
  async (c) => {
    const uri = c.req.valid('query').uri ?? '';
    return c.html(
      <Layout>
        <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
          <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Follow</h1>
          <form method='post' action='/follow' class='space-y-4'>
            <div>
              <input
                type='text'
                name='handle'
                placeholder='Handle to follow (e.g., @user@example.com)'
                required
                value={uri}
                class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400'
              />
            </div>
            <button
              type='submit'
              class='w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-2xl transition-colors'
            >
              Follow
            </button>
          </form>
        </section>
      </Layout>,
    );
  },
);

app.post(
  '/',
  sValidator(
    'form',
    z.object({
      handle: z.string().min(1),
    }),
  ),
  async (c) => {
    const form = c.req.valid('form');
    const handle = form.handle;
    if (typeof handle !== 'string') {
      return c.text('Invalid actor handle or URL', 400);
    }

    const sessionIdResult = await RA.flow(
      RA.ok(getCookie(c, 'sessionId')),
      RA.andThen(SessionId.parse),
    );
    if (!sessionIdResult.ok) {
      return c.text('Invalid session', 400);
    }

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    const useCase = SendFollowRequestUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      remoteActorLookup: FedifyRemoteActorLookup.getInstance(),
      followRequestedStore: PgFollowRequestedStore.getInstance(),
      remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
      logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
      actorResolverByUri: PgActorResolverByUri.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.val,
      handle,
      request: c.req.raw,
      ctx,
    });

    return RA.match({
      ok: () =>
        c.html(
          <Layout>
            <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
              <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Follow</h1>
              <div class='mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-2xl'>
                <p class='text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2'>
                  <svg class='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 13l4 4L19 7' />
                  </svg>
                  Successfully sent a follow request
                </p>
              </div>
              <a
                href='/'
                class='block w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-2xl transition-colors text-center'
              >
                Back to Home
              </a>
            </section>
          </Layout>,
        ),
      err: (err) =>
        c.html(
          <Layout>
            <section class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
              <h1 class='text-2xl font-bold text-gray-900 dark:text-white mb-6'>Follow</h1>
              <div class='mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl'>
                <p class='text-red-700 dark:text-red-300 text-sm'>
                  Failed to follow: {JSON.stringify(err)}
                </p>
              </div>
              <form method='post' action='/follow' class='space-y-4'>
                <div>
                  <input
                    type='text'
                    name='handle'
                    placeholder='Handle to follow (e.g., @user@example.com)'
                    required
                    class='w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400'
                  />
                </div>
                <button
                  type='submit'
                  class='w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-2xl transition-colors'
                >
                  Follow
                </button>
              </form>
            </section>
          </Layout>,
          400,
        ),
    })(result);
  },
);

export const FollowRouter = app;
